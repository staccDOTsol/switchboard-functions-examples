use crate::*;

pub use std::fs;

pub struct Sgx {}

impl Sgx {
    pub fn gramine_generate_quote(user_data: &[u8]) -> Result<Vec<u8>, SbError> {
        if fs::metadata("/dev/attestation/quote").is_err() {
            return Err(SbError::SgxError);
        }
        let mut hasher = Sha256::new();
        hasher.update(user_data);
        let hash_result = &hasher.finalize()[..32];

        let mut data = [0u8; 64];
        data[..32].copy_from_slice(hash_result);

        let user_report_data_path = "/dev/attestation/user_report_data";
        if fs::write(user_report_data_path, &data[..]).is_err() {
            return Err(SbError::SgxWriteError);
        }
        fs::read("/dev/attestation/quote").map_err(|_| SbError::SgxError)
    }

    pub fn read_rand(output: &mut [u8]) -> Result<(), SbError> {
        // https://is.gd/vlVLpC
        // https://github.com/rust-random/getrandom/blob/master/src/linux_android.rs#L17-L48
        // Gramine direct documentation: https://tinyurl.com/2hfc8n6y
        let buf = output.as_mut_ptr() as *mut libc::c_void;
        let buflen: libc::ssize_t = output.len().try_into().unwrap();
        let res = unsafe { libc::syscall(libc::SYS_getrandom, buf, buflen, 0) as libc::ssize_t };
        if res != buflen {
            return Err(SbError::SgxError);
        }
        Ok(())
    }
}
