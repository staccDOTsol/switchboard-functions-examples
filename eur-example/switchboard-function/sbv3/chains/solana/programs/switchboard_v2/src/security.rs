// https://github.com/neodyme-labs/solana-security-txt

#[macro_export]
macro_rules! security_txt {
    ($($name:ident: $value:expr),*) => {
        #[cfg_attr(target_arch = "bpf", link_section = ".security.txt")]
        #[allow(dead_code)]
        #[no_mangle]
        pub static security_txt: &str = concat! {
            "=======BEGIN SECURITY.TXT V1=======\0",
            $(stringify!($name), "\0", $value, "\0",)*
            "=======END SECURITY.TXT V1=======\0"
        };
    };
}

security_txt! {
    // Required fields
    name: "Switchboard V2",
    project_url: "https://switchboard.xyz",
    contacts: "email:security@switchboard.xyz,link:https://docs.switchboard.xyz/security,twitter:switchboard.xyz,telegram:switchboardxyz",
    policy: "https://docs.switchboard.xyz/security",

    // Optional Fields
    preferred_languages: "en",
    // source_code: "https://github.com/example/example",
//     encryption: "
// -----BEGIN PGP PUBLIC KEY BLOCK-----
// Comment: Alice's OpenPGP certificate
// Comment: https://www.ietf.org/id/draft-bre-openpgp-samples-01.html

// mDMEXEcE6RYJKwYBBAHaRw8BAQdArjWwk3FAqyiFbFBKT4TzXcVBqPTB3gmzlC/U
// b7O1u120JkFsaWNlIExvdmVsYWNlIDxhbGljZUBvcGVucGdwLmV4YW1wbGU+iJAE
// ExYIADgCGwMFCwkIBwIGFQoJCAsCBBYCAwECHgECF4AWIQTrhbtfozp14V6UTmPy
// MVUMT0fjjgUCXaWfOgAKCRDyMVUMT0fjjukrAPoDnHBSogOmsHOsd9qGsiZpgRnO
// dypvbm+QtXZqth9rvwD9HcDC0tC+PHAsO7OTh1S1TC9RiJsvawAfCPaQZoed8gK4
// OARcRwTpEgorBgEEAZdVAQUBAQdAQv8GIa2rSTzgqbXCpDDYMiKRVitCsy203x3s
// E9+eviIDAQgHiHgEGBYIACAWIQTrhbtfozp14V6UTmPyMVUMT0fjjgUCXEcE6QIb
// DAAKCRDyMVUMT0fjjlnQAQDFHUs6TIcxrNTtEZFjUFm1M0PJ1Dng/cDW4xN80fsn
// 0QEA22Kr7VkCjeAEC08VSTeV+QFsmz55/lntWkwYWhmvOgE=
// =iIGO
// -----END PGP PUBLIC KEY BLOCK-----
// ",
    auditors: "Kudelski"
//     acknowledgements: "
// The following hackers could've stolen all our money but didn't:
// - Neodyme
// "
}
