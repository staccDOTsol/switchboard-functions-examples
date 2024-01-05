use crate::manager::*;
use async_trait::async_trait;
use dashmap::{DashMap, DashSet};
use futures_util::future::join_all;
use std::{
    ops::Add,
    sync::Arc,
    time::{Duration, SystemTime},
};

type FetchContainerResult<'a, T> =
    std::pin::Pin<Box<dyn futures_util::Future<Output = Result<T, SbError>> + Send + 'a>>;

#[derive(Clone, Debug)]
pub struct ContainerManagerWithBackoff {
    pub docker: Arc<Docker>,
    pub docker_default_config: Config<String>,
    pub docker_credentials: DockerCredentials,

    // A mapping of active functions and the timestamp they were created
    pub active_functions: Arc<DashSet<String>>,
    pub max_active_functions: usize,

    pub function_backoff: Arc<DashMap<String, (i64, SystemTime)>>,
    pub max_function_backoff: i64,

    /// An incrementer for successive container failures
    // TODO: should error counter be based on params passed or overall?
    pub function_error_counter: Arc<DashMap<String, u32>>,
    /// The maximum number of failures before disabling
    // TODO: we need a way to classify failures into one of the following
    // * container logic / emitted error codes
    // * escrow balance issues (temp)
    // * callback issues (view ixn simulation)
    pub max_function_failures: u32,

    // < container name (TODO: maybe do by mrenclave and have routine populate a mapping) >
    pub container_blacklist: Arc<DashSet<String>>,
}

impl ContainerManagerWithBackoff {
    pub fn new(docker: Arc<Docker>, default_docker_config: Option<Config<String>>) -> Self {
        Self {
            docker,
            docker_credentials: DockerCredentials {
                username: Some(std::env::var("DOCKER_USER").unwrap_or_default()),
                password: Some(std::env::var("DOCKER_KEY").unwrap_or_default()),
                ..Default::default()
            },
            docker_default_config: default_docker_config.unwrap_or(get_default_docker_config()),

            active_functions: Arc::new(DashSet::new()),
            max_active_functions: 1000,

            function_backoff: Arc::new(DashMap::new()),
            max_function_backoff: 300,

            function_error_counter: Arc::new(DashMap::new()),
            max_function_failures: 10,

            container_blacklist: Arc::new(DashSet::new()),
        }
    }

    /// Checks whether the given function_key (request/routine) and image_name is ready to be
    /// executed based on the cache.
    pub fn is_function_ready(&self, function_key: &str, image_name: &str) -> ContainerResult<()> {
        if self.container_blacklist.contains(image_name) {
            debug!("Container is blacklisted: {:?}", image_name);
            return Err(SbError::DockerFetchError);
        }

        if self.active_functions.contains(function_key) {
            debug!("Function is active: {:?}", function_key);
            return Err(SbError::ContainerActive);
        }

        if let Some(backoff) = self.is_function_backoff(function_key) {
            debug!("Function backoff {} seconds: {:?}", backoff, function_key);
            return Err(SbError::ContainerBackoff(backoff));
        }

        let function_error_count = self.get_function_error_count(function_key);
        if function_error_count >= self.max_function_failures {
            debug!(
                "Function error count ({}) exceeds threshold ({}): {:?}",
                function_error_count, self.max_function_failures, function_key
            );
            return Err(SbError::FunctionErrorCountExceeded(function_error_count));
        }

        Ok(())
    }

    pub fn is_ready_for_new_function(&self) -> bool {
        self.max_active_functions > self.active_functions.len()
    }

    pub fn add_active_function(&self, function_key: &str) -> ContainerResult<bool> {
        if !self.is_ready_for_new_function() {
            return Err(SbError::ContainerCreateError(Arc::new(SbError::Message(
                "DockerNotReady",
            ))));
        }

        let was_added = self.active_functions.insert(function_key.to_string());
        Ok(was_added)
    }

    pub fn remove_active_function(&self, function_key: &str) -> bool {
        self.active_functions.remove(function_key).is_some()
    }

    pub fn get_function_backoff(&self, function_key: &str) -> Option<(i64, SystemTime)> {
        if let Some(entry) = self.function_backoff.get(function_key) {
            let (backoff, next_timestamp) = *entry;
            Some((backoff, next_timestamp))
        } else {
            None
        }
    }

    pub fn add_function_backoff(&self, function_key: &str) -> (i64, SystemTime) {
        let (new_backoff, new_next_timestamp) =
            if let Some(entry) = self.function_backoff.get_mut(function_key) {
                let (backoff, next_timestamp) = *entry;
                let new_backoff = std::cmp::min(self.max_function_backoff, backoff.to_owned() + 5);
                let next_timestamp =
                    next_timestamp.add(Duration::from_secs(new_backoff.try_into().unwrap_or(5)));

                (new_backoff, next_timestamp)
            } else {
                (5, SystemTime::now().add(Duration::from_secs(5)))
            };

        self.function_backoff
            .insert(function_key.to_string(), (new_backoff, new_next_timestamp));

        (new_backoff, new_next_timestamp)
    }

    pub fn remove_function_backoff(&self, function_key: &str) -> bool {
        self.function_backoff.remove(function_key).is_some()
    }

    pub fn get_function_error_count(&self, function_key: &str) -> u32 {
        if let Some(error_count) = self.function_error_counter.get(function_key) {
            *error_count
        } else {
            0
        }
    }

    pub fn is_function_backoff(&self, function_key: &str) -> Option<u64> {
        if let Some(entry) = self.function_backoff.get(function_key) {
            let (_backoff, next_allowed_run) = *entry;
            if let Ok(duration) = next_allowed_run.duration_since(SystemTime::now()) {
                let seconds_until_future_time = duration.as_secs();
                return Some(seconds_until_future_time);
            }
        }

        None
    }

    pub fn add_function_error(&self, function_key: &str) -> u32 {
        let current_count = self.get_function_error_count(function_key);
        let new_count = current_count + 1;

        if let Some(mut entry) = self.function_error_counter.get_mut(function_key) {
            *entry = new_count;
        } else {
            self.function_error_counter
                .insert(function_key.to_string(), new_count);
        }

        new_count
    }

    pub fn reset_function_error(&self, function_key: &str) -> bool {
        self.function_error_counter.remove(function_key).is_some()
    }

    pub fn blacklist_container(&self, image_name: &str) -> bool {
        self.container_blacklist.insert(image_name.to_string())
    }

    pub fn whitelist_container(&self, image_name: &str) -> bool {
        self.container_blacklist.remove(image_name).is_some()
    }

    /// Fetch all layers and tags for the docker image switchboardlabs/sgx-function
    pub async fn fetch_switchboard_docker_layers(&self) -> ContainerResult<()> {
        let switchboard_image_name = "switchboardlabs/sgx-function".to_string();

        let mut create_img_stream = self.docker.create_image(
            Some(bollard::image::CreateImageOptions {
                from_image: switchboard_image_name.clone(),
                platform: "linux/amd64".to_string(),
                ..Default::default()
            }),
            None,
            Some(self.docker_credentials.clone()),
        );

        while let Some(Ok(progress)) = create_img_stream.next().await {
            trace!(
                "{:?} {:?} {:?} {:?}",
                switchboard_image_name.clone(),
                progress.id,
                progress.status,
                progress.progress,
                { id: switchboard_image_name.clone() }
            );
        }

        Ok(())
    }

    /// Fetch a list of docker images from the registry and blacklist images that cannot be pulled
    pub async fn fetch_images(&self, images: Vec<String>) -> ContainerResult<()> {
        let futures_vec: Vec<FetchContainerResult<bollard::models::ImageInspect>> = images
            .iter()
            .map(|image_name| self.inspect_image(image_name.as_str()))
            .collect();

        let results = join_all(futures_vec).await;

        for (i, result) in results.iter().enumerate() {
            let image_name: &String = images.get(i).unwrap();
            match result {
                Ok(image) => {
                    if let Some(size) = image.size {
                        let size_in_mb = size / 1024 / 1024;
                        info!("{}: Size = {} MB", image_name.clone(), size_in_mb);

                        if size_in_mb > 750 && self.container_blacklist.insert(image_name.clone()) {
                            info!("Docker image blacklisted {}", image_name);
                        }
                    }

                    if self.container_blacklist.remove(image_name).is_some() {
                        info!("Docker image removed from blacklist: {}", image_name);
                    }
                }
                Err(e) => {
                    error!("Failed to inspect docker image {}: {:#?}", image_name, e);
                    if self.container_blacklist.insert(image_name.clone()) {
                        info!("Docker image blacklisted {}", image_name);
                    }
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl ContainerManager for ContainerManagerWithBackoff {
    fn docker(&self) -> &Arc<Docker> {
        &self.docker
    }

    fn docker_credentials(&self) -> &DockerCredentials {
        &self.docker_credentials
    }

    fn docker_default_config(&self) -> &Config<String> {
        &self.docker_default_config
    }

    async fn create_docker_container(
        &self,
        function_key: &str,
        image_name: &str,
        env: Option<Vec<String>>,
        overrides: Option<DockerContainerOverrides>,
        custom_config: Option<Config<String>>,
    ) -> ContainerResult<DockerContainer> {
        // Verify there is capacity and the function is not already being executed
        self.is_function_ready(function_key, image_name)?;

        let config =
            self.get_container_config(image_name, env.clone(), overrides.unwrap_or_default());

        // Pull the image
        // Can we cache this?
        let was_downloaded = self.fetch_image(image_name).await?;
        if was_downloaded {
            debug!("Downloaded image {}", image_name, { id: function_key });
        }

        match self
            .docker()
            .create_container::<String, _>(
                Some(CreateContainerOptions {
                    ..Default::default()
                }),
                custom_config.unwrap_or(config.clone()),
            )
            .await
        {
            Ok(result) => {
                info!("Created container for image {}", image_name, { id: function_key });

                Ok(DockerContainer {
                    id: result.id,
                    image_name: image_name.to_string(),
                    env: env.unwrap_or_default(),
                    docker: self.docker().clone(),
                    config: config.clone(),
                })
            }
            Err(error) => {
                let error_message = format!(
                    "Failed to create container for image {}, {}",
                    image_name, error
                );
                info!("{}", error_message, { id: function_key });

                Err(SbError::ContainerError(std::sync::Arc::new(error)))
            }
        }
    }
}
