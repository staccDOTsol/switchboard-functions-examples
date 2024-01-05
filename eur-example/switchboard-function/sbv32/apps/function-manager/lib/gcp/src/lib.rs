use secret_vault::gcp::GcpSecretManagerSource;
use secret_vault::SecretVaultRef;
use secret_vault::SecretsSource;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::runtime::Runtime;

#[no_mangle]
pub extern "C" fn gsm_get_secret(
    fqn: *const u8,
    fqn_len: usize,
    rout: *mut u8,
    out_len: *mut usize,
) {
    let max_len = unsafe { *out_len };
    let fqn = unsafe { std::slice::from_raw_parts(fqn, fqn_len) };
    let fqn = String::from_utf8(fqn.to_vec()).unwrap();
    let rt = Runtime::new().unwrap();
    let out = Arc::new(Mutex::new(String::new()));
    let out2 = out.clone();
    rt.block_on(async move {
        let mut out = out2.lock().unwrap();
        *out = gsm_get_secret_inner(fqn).await;
    });
    let ret = out.lock().unwrap().as_bytes().to_vec();
    unsafe {
        *out_len = ret.len();
    }
    let src = ret.as_ptr();
    // Should ensure no buffer overflow
    let end = std::cmp::min(ret.len(), max_len);
    for i in 0..end {
        unsafe { *rout.add(i) = *src.add(i) };
    }
}

pub async fn gsm_get_secret_inner(fqn: String) -> String {
    let parts: Vec<&str> = fqn.split("/").collect();
    let project_id = parts[1];
    let gsm_secret_ref = SecretVaultRef::new(parts[3].into())
        .with_required(true)
        .with_secret_version(parts[5].into());
    let gsm = GcpSecretManagerSource::new(project_id.into())
        .await
        .unwrap();
    let secrets = gsm.get_secrets(&[gsm_secret_ref.clone()]).await.unwrap();
    secrets
        .get(&gsm_secret_ref)
        .unwrap()
        .value
        .as_sensitive_str()
        .to_string()
}
