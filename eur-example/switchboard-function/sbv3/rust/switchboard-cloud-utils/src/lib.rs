use secret_vault::SecretsSource;
use secret_vault::{gcp::GcpSecretManagerSource, SecretVaultRef};

pub async fn get_gsm_secret(google_secret_path: &str) -> std::result::Result<String, &'static str> {
    let (project_id, secret_name, secret_version) = extract_gsm_secret_details(google_secret_path)?;

    let gsm_secret_ref = SecretVaultRef::new(secret_name.into())
        .with_required(true)
        .with_secret_version(secret_version.into());

    let gsm = GcpSecretManagerSource::new(project_id.as_str())
        .await
        .unwrap();

    let secrets = gsm.get_secrets(&[gsm_secret_ref.clone()]).await.unwrap();
    let secret = secrets
        .get(&gsm_secret_ref)
        .unwrap()
        .value
        .as_sensitive_str()
        .to_string();

    Ok(secret)
}

fn extract_gsm_secret_details(
    google_secret_path: &str,
) -> Result<(String, String, String), &'static str> {
    let parts: Vec<&str> = google_secret_path.split('/').collect();

    if parts.len() < 4 {
        return Err("Invalid input string format.");
    }

    let project_id = parts[1].to_string();
    let secret_name = parts[3].to_string();

    let secret_version = if parts.len() >= 6 {
        parts[5].to_string()
    } else {
        "latest".to_string()
    };

    Ok((project_id, secret_name, secret_version))
}
