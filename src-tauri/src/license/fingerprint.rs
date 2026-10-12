//! Soft device fingerprint — not hardware locked, allows reasonable transfers.
//! Hash of stable identifiers: home dir + OS + user + hostname.
//! Privacy: one-way hash, never sent in clear beyond license server activation.

use sha2::{Digest, Sha256};

pub fn get_device_fingerprint() -> String {
    let mut buf = String::new();

    // Home dir (stable per user)
    if let Some(home) = dirs::home_dir() {
        buf.push_str(&home.to_string_lossy());
        buf.push('|');
    }

    // OS
    buf.push_str(std::env::consts::OS);
    buf.push('|');
    buf.push_str(std::env::consts::ARCH);
    buf.push('|');

    // User
    if let Ok(user) = std::env::var("USERNAME").or_else(|_| std::env::var("USER")) {
        buf.push_str(&user);
        buf.push('|');
    }

    // Hostname
    if let Ok(host) = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::env::var("HOST"))
    {
        buf.push_str(&host);
        buf.push('|');
    }

    // Try to read machine-id on linux for extra stability (best effort)
    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
            buf.push_str(id.trim());
            buf.push('|');
        }
    }

    // Hash
    let mut hasher = Sha256::new();
    hasher.update(buf.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)[..16].to_string() // 16 hex chars = 64 bits, enough for soft binding
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_stable_and_nonempty() {
        let a = get_device_fingerprint();
        let b = get_device_fingerprint();
        assert_eq!(a, b);
        assert!(a.len() == 16);
        assert!(!a.is_empty());
    }
}
