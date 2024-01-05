use bollard::{
    auth::DockerCredentials,
    container::{
        Config, CreateContainerOptions, DownloadFromContainerOptions, KillContainerOptions,
        ListContainersOptions, LogOutput, LogsOptions, RemoveContainerOptions,
        StartContainerOptions,
    },
    image::{CreateImageOptions, ListImagesOptions},
    service::{AuthConfig, CreateImageInfo},
    Docker,
};
use futures_util::StreamExt;
use miette::Result;
use regex::Regex;
use sha256::digest;
use std::iter::Filter;
use tokio::io::AsyncReadExt;
use tokio_tar::Archive;
use tokio_util::io::StreamReader;

fn get_container_credentials() -> Option<DockerCredentials> {
    Some(DockerCredentials {
        username: Some(std::env::var("DOCKER_USER").unwrap_or(String::new())),
        password: Some(std::env::var("DOCKER_KEY").unwrap_or(String::new())),
        ..Default::default()
    })
}

fn get_container_config(
    image_name: &str,
    detached: Option<bool>,
    entrypoint: Option<Vec<String>>,
) -> Config<String> {
    Config {
        image: Some(image_name.to_string()),
        tty: detached,
        entrypoint,
        ..Default::default()
    }
}

fn get_container_name(config: &Config<String>) -> String {
    let mut img = config.image.clone().unwrap_or_default();
    if let Some(index) = img.find(':') {
        img.truncate(index);
    }

    let re = Regex::new(r"[^a-zA-Z0-9_.-]").unwrap();
    let cleaned_up_img_name = re.replace_all(img.as_str(), "-").to_string();

    let container_name = format!(
        "{}-{}",
        cleaned_up_img_name,
        digest(serde_json::to_string_pretty(&config).unwrap())
    );

    container_name
}

pub async fn check_container_exists(docker: &Docker, container_name: &str) -> Result<bool> {
    let existing_containers = docker
        .list_containers(Some(ListContainersOptions {
            all: true,
            limit: None,
            size: false,
            filters: std::iter::once(("name".to_string(), vec![container_name.to_string()]))
                .collect(),
        }) as Option<ListContainersOptions<String>>)
        .await
        .unwrap();
    // debug!("Existing Containers:\n{:?}", existing_containers);

    Ok(!existing_containers.is_empty())
}

pub async fn get_or_create_container<T>(
    docker: &Docker,
    config: &Config<String>,
    container_name: &str,
    options: Option<CreateContainerOptions<T>>,
    pull: Option<bool>,
) -> Result<()>
where
    T: Into<String> + serde::Serialize,
{
    let container_exists = check_container_exists(docker, container_name)
        .await
        .unwrap();

    let img_name = config.image.as_ref().unwrap();
    let local_image = docker.inspect_image(img_name).await;

    let pull = pull.unwrap_or_default();

    if container_exists && !pull {
        return Ok(());
    }

    debug!("pull: {}", pull);

    if container_exists && pull && local_image.is_ok() {
        let local_image_id = local_image.unwrap().id.unwrap();
        debug!("local_image_id: {}", local_image_id);

        // check against remote
        // Fetch the image from the registry
        let remote_image = docker
            .list_images(Some(ListImagesOptions {
                all: true,
                digests: true,
                filters: std::iter::once(("reference".to_string(), vec![img_name.clone()]))
                    .collect(),
            }))
            .await
            .unwrap()
            .into_iter()
            .find(|img| img.id == local_image_id)
            .unwrap();

        debug!("remote_image_id: {}", remote_image.id);

        // No need to pull new image
        if remote_image.id == local_image_id {
            return Ok(());
        }

        // Remove the old container
        docker
            .remove_container(container_name, None::<RemoveContainerOptions>)
            .await
            .unwrap();

        // Pull the new image
        let mut create_img_stream = docker.create_image(
            Some(CreateImageOptions {
                from_image: img_name.clone(),
                ..Default::default()
            }),
            None,
            None,
        );

        let mut new_img_id: Option<String> = None;
        // let mut stream = docker.logs(container_name.as_str(), logs_options);
        while let Some(Ok(CreateImageInfo {
            id,
            error,
            status,
            progress,
            progress_detail,
        })) = create_img_stream.next().await
        {
            debug!("Progress: {}", progress.unwrap_or_default());
            debug!("ProgressDetail: {:?}", progress_detail.unwrap_or_default());

            if id.is_some() {
                new_img_id = id;
                break;
            }
        }

        // Create the new container
        docker
            .create_container(options, config.clone())
            .await
            .unwrap();

        return Ok(());
    }

    if container_exists {
        return Ok(());
    }

    docker
        .create_container(options, config.clone())
        .await
        .unwrap();

    Ok(())
}

pub async fn download_measurement<T>(
    docker: &Docker,
    container_name: &str,
    options: Option<DownloadFromContainerOptions<T>>,
) -> Result<String, Box<dyn std::error::Error>>
where
    T: Into<String> + serde::Serialize,
{
    // Get the tar stream
    let stream = docker.download_from_container(container_name, options);

    // Convert the stream into an AsyncRead
    let async_read = StreamReader::new(
        stream.map(|res| res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))),
    );

    // Unarchive the tar
    let mut archive = Archive::new(async_read);

    // Look for the 'measurement.txt' file in the stream of entries
    let mut file_contents: String = String::new();
    while let Some(entry) = archive.entries()?.next().await {
        let mut entry = entry?;
        if entry.path()?.ends_with("measurement.txt") {
            entry.read_to_string(&mut file_contents).await?;
            break;
        }
    }

    Ok(file_contents.trim().to_string())
}

pub async fn get_dockerhub_measurement(image_name: String) -> Result<String> {
    let config = get_container_config(&image_name, None, None);
    let container_name = get_container_name(&config);
    debug!("container_name: {}", container_name);

    let docker = Docker::connect_with_local_defaults().unwrap();
    get_or_create_container(
        &docker,
        &config,
        &container_name,
        Some(CreateContainerOptions {
            name: container_name.clone(),
            platform: Some("linux/amd64".to_string()),
        }),
        None,
    )
    .await?;

    let download_options = Some(DownloadFromContainerOptions {
        path: "/measurement.txt",
    });

    let measurement = download_measurement(&docker, &container_name, download_options)
        .await
        .unwrap();

    Ok(measurement)
}

pub async fn simulate_container(image_name: String, pull: Option<bool>) -> Result<()> {
    let config = get_container_config(
        &image_name,
        None,
        Some(vec![
            "/bin/bash".to_string(),
            "/boot.sh".to_string(),
            "--test".to_string(),
        ]),
    );
    let container_name = get_container_name(&config);
    debug!("container_name: {}", container_name);

    let docker = Docker::connect_with_local_defaults().unwrap();
    get_or_create_container(
        &docker,
        &config,
        &container_name,
        Some(CreateContainerOptions {
            name: container_name.clone(),
            platform: Some("linux/amd64".to_string()),
        }),
        pull,
    )
    .await?;

    // start container with new entrypoint and overwrite with --test
    docker
        .start_container(&container_name, None::<StartContainerOptions<String>>)
        .await
        .unwrap();

    let logs_options: Option<LogsOptions<String>> = Some(LogsOptions {
        follow: true,
        stdout: true,
        ..Default::default()
    });
    let mut stream = docker.logs(container_name.as_str(), logs_options);
    while let Some(Ok(LogOutput::StdOut { message })) = stream.next().await {
        println!("{}", String::from_utf8_lossy(&message.to_ascii_lowercase()));
    }

    std::thread::sleep(std::time::Duration::from_secs(10));

    Ok(())
}
