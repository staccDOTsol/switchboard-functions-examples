use crate::*;

use bollard::container::Config;
use bollard::service::{
    DeviceMapping, HostConfig, Mount, MountTypeEnum, RestartPolicy, RestartPolicyNameEnum,
};

pub fn get_default_docker_config() -> Config<String> {
    Config {
        open_stdin: Some(true),
        host_config: Some(HostConfig {
            // Possibly exposes metrics daemon
            network_mode: Some("bridge".to_string()),
            restart_policy: Some(RestartPolicy {
                name: Some(RestartPolicyNameEnum::NO),
                maximum_retry_count: None,
            }),
            auto_remove: Some(true),
            // oom_kill_disable: Some(true),
            readonly_rootfs: Some(true),
            security_opt: Some(vec!["no-new-privileges".to_string()]),
            memory: Some(128 * 1024 * 1024), // 128 MB
            nano_cpus: Some((0.2 * 10f64.powf(9.0)).floor() as i64),
            mounts: Some(vec![Mount {
                target: Some("/var/run/aesmd/aesm.socket".to_owned()),
                source: Some("/var/run/aesmd/aesm.socket".to_owned()),
                typ: Some(MountTypeEnum::BIND),
                read_only: Some(true),
                ..Default::default()
            }]),
            devices: Some(vec![
                DeviceMapping {
                    path_on_host: Some("/dev/sgx_provision".to_string()),
                    path_in_container: Some("/dev/sgx_provision".to_string()),
                    cgroup_permissions: Some("rw".to_string()),
                },
                DeviceMapping {
                    path_on_host: Some("/dev/sgx_enclave".to_string()),
                    path_in_container: Some("/dev/sgx_enclave".to_string()),
                    cgroup_permissions: Some("rw".to_string()),
                },
            ]),
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub fn get_default_qvn_config(
    image_name: &str,
    env: Vec<String>,
    default_config: Option<Config<String>>,
    volume_mounts: Option<Vec<Mount>>,
) -> Config<String> {
    let config = default_config.unwrap_or(get_default_docker_config());
    let host_config = config.host_config.unwrap_or_default();
    let mut mounts = host_config.mounts.unwrap_or_default();
    mounts.push(Mount {
        target: Some("/data/protected_files".to_string()),
        source: Some("/data/protected_files".to_string()),
        typ: Some(bollard::service::MountTypeEnum::BIND),
        read_only: Some(false),
        ..Default::default()
    });
    // mounts.push(Mount {
    //     target: Some("/home/credentials".to_string()),
    //     source: Some("/home/credentials".to_string()),
    //     typ: Some(bollard::service::MountTypeEnum::BIND),
    //     read_only: Some(true),
    //     ..Default::default()
    // });
    if let Some(volume_mounts) = volume_mounts {
        for mount in volume_mounts {
            if mount.target.as_ref().unwrap() == "/data/protected_files"
                || mount.target.as_ref().unwrap() == "/var/run/aesmd/aesm.socket"
            {
                continue;
            }
            mounts.push(mount);
        }
    }
    Config {
        image: Some(image_name.to_string()),
        env: Some(env),
        host_config: Some(HostConfig {
            mounts: Some(mounts),
            network_mode: Some("host".to_string()),
            auto_remove: Some(false), // cant be set if restart policy is set
            // TODO: assess whether we should give it more resources
            memory: Some(256 * 1024 * 1024),
            nano_cpus: Some((0.3 * 10f64.powf(9.0)).floor() as i64),
            // QVN should always be running until shut down
            restart_policy: Some(RestartPolicy {
                name: Some(bollard::service::RestartPolicyNameEnum::UNLESS_STOPPED),
                maximum_retry_count: None,
            }),
            ..host_config
        }),
        ..config
    }
}
