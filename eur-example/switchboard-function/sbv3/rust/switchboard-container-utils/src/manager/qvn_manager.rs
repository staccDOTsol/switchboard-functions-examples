// use crate::manager::*;
// use async_trait::async_trait;
// use std::sync::Arc;

// #[derive(Clone, Debug)]
// pub struct ContainerManagerWithQvn {
//     pub docker: Arc<Docker>,
//     pub docker_default_config: Config<String>,
//     pub docker_credentials: DockerCredentials,

//     pub qvn: QvnContainer,
// }

// impl ContainerManagerWithQvn {
//     pub fn new(
//         docker: Arc<Docker>,
//         qvn: QvnContainer,
//         default_docker_config: Option<Config<String>>,
//     ) -> Self {
//         Self {
//             docker,
//             docker_credentials: DockerCredentials {
//                 username: Some(std::env::var("DOCKER_USER").unwrap_or(String::new())),
//                 password: Some(std::env::var("DOCKER_KEY").unwrap_or(String::new())),
//                 ..Default::default()
//             },
//             docker_default_config: default_docker_config.unwrap_or(get_default_docker_config()),
//             qvn,
//         }
//     }

//     pub async fn create(
//         docker: bollard::Docker,
//         qvn_image_name: &str,
//         qvn_env: Vec<String>,
//         default_docker_config: Option<Config<String>>,
//     ) -> ContainerResult<Self> {
//         let qvn = QvnContainer::create(
//             docker.clone(),
//             qvn_image_name,
//             qvn_env,
//             default_docker_config.clone(),
//         )
//         .await?;

//         Ok(ContainerManagerWithQvn::new(
//             std::sync::Arc::new(docker),
//             qvn,
//             default_docker_config,
//         ))
//     }

//     pub async fn start(&self) -> ContainerResult<()> {
//         self.qvn.start_container().await
//     }

//     pub async fn run_sb_function(
//         &self,
//         key: &str,
//         image_name: &str,
//         env: Vec<String>,
//     ) -> ContainerResult<()> {
//         let container = self
//             .create_docker_container(
//                 key,
//                 image_name,
//                 Some(env),
//                 DockerContainerOverrides { entrypoint: None },
//             )
//             .await?;

//         // TODO: assess the performance impact of streaming logs or collecting after the container is done

//         // TODO: Should we kill the container now or wait for a successful run?
//         // Currently we dont derive the container name based on the params but maybe we should?

//         match container.run(Some(10)).await {
//             Ok(logs) => {
//                 info!("Successfully ran function {:?}", key, {id: key});
//                 info!("{:?}", parse_gramine_logs(&logs), {id: key});

//                 match find_fn_result(&logs) {
//                     Ok(fn_result) => {
//                         info!("Sending function result to QVN {:?}", key, {id: key});
//                         self.qvn.send_result(&fn_result).await?;
//                     }
//                     Err(e) => {
//                         error!("Failed to find FN_OUT in the containers emitted logs: {:?}",e, {id: key});
//                     }
//                 }
//             }
//             Err(e) => {
//                 error!("Failed to run function {}", key, {id: key});
//                 error!("{}", e, {id: key});
//             }
//         }

//         container.remove().await?;

//         Ok(())
//     }
// }

// #[async_trait]
// impl ContainerManager for ContainerManagerWithQvn {
//     fn docker(&self) -> &Arc<Docker> {
//         &self.docker
//     }

//     fn docker_credentials(&self) -> &DockerCredentials {
//         &self.docker_credentials
//     }

//     fn docker_default_config(&self) -> &Config<String> {
//         &self.docker_default_config
//     }
// }
