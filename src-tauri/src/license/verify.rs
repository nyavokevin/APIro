//! Offline license verification — Ed25519 base32
//! Public key embedded in binary, private key never shipped.

use base32::Alphabet;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use serde::{Deserialize, Serialize};

// ---- Public key (generated via gen-keypair) ----
// Private (hex): 228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4
// Public (hex):  22fffce821cfffc8c578e0a12b0ff469d1c4962f65914d420c3261c71d73e14c
// KEEP PUBLIC ONLY — never commit private key to repo (env var in production).
pub const APIRO_PUBLIC_KEY: &[u8] = &[
    34, 255, 252, 232, 33, 207, 255, 200, 197, 120, 224, 161, 43, 15, 244, 105, 209, 196, 150,
    47, 101, 145, 77, 66, 12, 50, 97, 199, 29, 115, 225, 76,
];

const SIG_B32_LEN: usize = 103; // 64 bytes *8 /5 ceiled

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LicensePayload {
    pub license_id: String,
    pub tier: LicenseTier,
    #[serde(default = "default_seats")]
    pub seats: u32,
    pub issued_at: DateTime<Utc>,
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub customer_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LicenseTier {
    Pro,
    Team,
}

fn default_seats() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq)]
pub enum LicenseError {
    InvalidFormat(String),
    InvalidBase32(String),
    InvalidSignature,
    InvalidPayload(String),
    Expired,
}

impl std::fmt::Display for LicenseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LicenseError::InvalidFormat(s) => write!(f, "Invalid license format: {}", s),
            LicenseError::InvalidBase32(s) => write!(f, "Invalid base32: {}", s),
            LicenseError::InvalidSignature => write!(f, "Invalid signature"),
            LicenseError::InvalidPayload(s) => write!(f, "Invalid payload: {}", s),
            LicenseError::Expired => write!(f, "License expired"),
        }
    }
}

impl std::error::Error for LicenseError {}

fn b32_decode(s: &str) -> Result<Vec<u8>, LicenseError> {
    base32::decode(Alphabet::RFC4648 { padding: false }, s)
        .ok_or_else(|| LicenseError::InvalidBase32(format!("cannot decode '{}'", s)))
}

fn b32_encode(bytes: &[u8]) -> String {
    base32::encode(Alphabet::RFC4648 { padding: false }, bytes)
}

/// Normalise user input: trim, uppercase, strip APIRO- prefix, remove dashes/spaces.
/// Returns (payload_b32, sig_b32)
fn split_key(license_key: &str) -> Result<(String, String), LicenseError> {
    let trimmed = license_key.trim().to_uppercase();
    if trimmed.is_empty() {
        return Err(LicenseError::InvalidFormat("empty key".into()));
    }
    // Strip prefix APIRO- or APIRO (with optional separator)
    let without_prefix = if let Some(rest) = trimmed.strip_prefix("APIRO-") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("APIRO ") {
        rest
    } else if trimmed.starts_with("APIRO") && trimmed.len() > 5 {
        // e.g. APIROXXXX... without dash — strip 5 chars
        &trimmed[5..]
    } else {
        return Err(LicenseError::InvalidFormat(
            "must start with APIRO-".into(),
        ));
    };
    // Remove all dashes, spaces, newlines for robustness (human grouped format)
    let cleaned: String = without_prefix
        .chars()
        .filter(|c| *c != '-' && *c != ' ' && *c != '\n' && *c != '\r' && *c != '\t')
        .collect();
    if cleaned.len() <= SIG_B32_LEN {
        return Err(LicenseError::InvalidFormat(format!(
            "too short: got {} chars, need > {}",
            cleaned.len(),
            SIG_B32_LEN
        )));
    }
    let payload_len = cleaned.len() - SIG_B32_LEN;
    let payload_b32 = cleaned[..payload_len].to_string();
    let sig_b32 = cleaned[payload_len..].to_string();
    if payload_b32.is_empty() || sig_b32.len() != SIG_B32_LEN {
        return Err(LicenseError::InvalidFormat(
            "payload or signature length invalid".into(),
        ));
    }
    Ok((payload_b32, sig_b32))
}

/// Verify with custom public key (for tests with dedicated test keypair)
pub fn verify_license_offline_with_key(
    license_key: &str,
    public_key_bytes: &[u8],
) -> Result<LicensePayload, LicenseError> {
    let (payload_b32, sig_b32) = split_key(license_key)?;
    let payload_bytes = b32_decode(&payload_b32)?;
    let sig_bytes = b32_decode(&sig_b32)?;
    if sig_bytes.len() != 64 {
        return Err(LicenseError::InvalidBase32(format!(
            "signature must be 64 bytes, got {}",
            sig_bytes.len()
        )));
    }
    let mut sig_array = [0u8; 64];
    sig_array.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_array);

    let public_key = VerifyingKey::from_bytes(
        public_key_bytes
            .try_into()
            .map_err(|_| LicenseError::InvalidPayload("public key must be 32 bytes".into()))?,
    )
    .map_err(|e| LicenseError::InvalidPayload(format!("public key invalid: {}", e)))?;

    public_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| LicenseError::InvalidSignature)?;

    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| LicenseError::InvalidPayload(format!("JSON parse: {}", e)))?;

    if let Some(expires_at) = payload.expires_at {
        if Utc::now() > expires_at {
            return Err(LicenseError::Expired);
        }
    }

    Ok(payload)
}

/// Verify license offline — no network required.
/// Returns decoded payload if signature valid and not expired.
pub fn verify_license_offline(license_key: &str) -> Result<LicensePayload, LicenseError> {
    verify_license_offline_with_key(license_key, APIRO_PUBLIC_KEY)
}

#[tauri::command]
pub fn license_verify_offline(key: String) -> Result<LicensePayload, String> {
    verify_license_offline(&key).map_err(|e| e.to_string())
}

/// Helper used by server-side generation (and tests) — sign payload bytes.
/// Not exposed as Tauri command; only used via CLI generation where private key is env-provided.
pub fn sign_payload(payload_bytes: &[u8], private_key_bytes: &[u8; 32]) -> String {
    use ed25519_dalek::{SigningKey, Signer};
    let signing_key = SigningKey::from_bytes(private_key_bytes);
    let signature = signing_key.sign(payload_bytes);
    b32_encode(&signature.to_bytes())
}

pub fn encode_license_key(payload: &LicensePayload, private_key_hex: &str) -> Result<String, String> {
    let payload_bytes = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let payload_b32 = b32_encode(&payload_bytes);
    let pk_bytes = hex::decode(private_key_hex.trim()).map_err(|e| format!("private key hex: {}", e))?;
    if pk_bytes.len() != 32 {
        return Err(format!("private key must be 32 bytes, got {}", pk_bytes.len()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&pk_bytes);
    let sig_b32 = sign_payload(&payload_bytes, &arr);
    // Human-typeable grouping: APIRO-XXXX-XXXX-... but keep simple: APIRO-<payload>-<sig>
    // For display, group entire suffix by 4 with dashes
    let raw = format!("{}-{}", payload_b32, sig_b32);
    // Group by 4 for readability: APIRO-XXXX-XXXX...
    let grouped: String = raw
        .chars()
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-");
    Ok(format!("APIRO-{}", grouped))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};
    use ed25519_dalek::SigningKey;

    fn test_private_key() -> [u8; 32] {
        // Same as generate: 228c5c...
        let hex = "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4";
        let bytes = hex::decode(hex).unwrap();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        arr
    }

    fn test_public_key() -> Vec<u8> {
        APIRO_PUBLIC_KEY.to_vec()
    }

    // Dedicated test keypair different from prod public — ensures wrong-key test is meaningful
    fn other_keypair() -> ([u8; 32], Vec<u8>) {
        // Fixed other private: 99...01
        let hex = "9999999999999999999999999999999999999999999999999999999999999901";
        let bytes = hex::decode(hex).unwrap();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        let sk = SigningKey::from_bytes(&arr);
        let pk = sk.verifying_key().to_bytes().to_vec();
        (arr, pk)
    }

    fn sample_payload() -> LicensePayload {
        LicensePayload {
            license_id: "lic_test123".into(),
            tier: LicenseTier::Pro,
            seats: 1,
            issued_at: Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap(),
            expires_at: None,
            customer_email: Some("test@example.com".into()),
        }
    }

    fn generate_with_key(payload: &LicensePayload, sk: &[u8; 32]) -> String {
        let payload_bytes = serde_json::to_vec(payload).unwrap();
        let sig_b32 = sign_payload(&payload_bytes, sk);
        let payload_b32 = b32_encode(&payload_bytes);
        format!("APIRO-{}-{}", payload_b32, sig_b32)
    }

    // === Suite demandée dans le prompt ===

    #[test]
    fn valid_signature_passes() {
        let payload = sample_payload();
        let key = generate_with_key(&payload, &test_private_key());
        let result = verify_license_offline_with_key(&key, &test_public_key());
        assert!(result.is_ok(), "valid key should pass: {:?}", result);
    }

    #[test]
    fn tampered_payload_fails() {
        let payload = sample_payload();
        let key = generate_with_key(&payload, &test_private_key());
        // Corrupt one char in payload part (after APIRO-)
        let mut chars: Vec<char> = key.chars().collect();
        // Find first non-dash char after prefix and flip it
        let prefix_len = 6; // "APIRO-"
        let idx = prefix_len + 5;
        chars[idx] = if chars[idx] == 'A' { 'B' } else { 'A' };
        let tampered: String = chars.into_iter().collect();
        let result = verify_license_offline_with_key(&tampered, &test_public_key());
        assert!(
            matches!(result, Err(LicenseError::InvalidSignature) | Err(LicenseError::InvalidBase32(_)) | Err(LicenseError::InvalidPayload(_))),
            "tampered should fail, got {:?}", result
        );
    }

    #[test]
    fn wrong_public_key_fails() {
        let payload = sample_payload();
        let key = generate_with_key(&payload, &test_private_key());
        let (_other_sk, other_pk) = other_keypair();
        let result = verify_license_offline_with_key(&key, &other_pk);
        assert!(result.is_err(), "wrong key should fail");
        assert_eq!(result.unwrap_err(), LicenseError::InvalidSignature);
    }

    #[test]
    fn expired_license_rejected() {
        let mut payload = sample_payload();
        payload.expires_at = Some(Utc::now() - Duration::days(1));
        let key = generate_with_key(&payload, &test_private_key());
        let result = verify_license_offline_with_key(&key, &test_public_key());
        assert!(matches!(result, Err(LicenseError::Expired)), "expired should be rejected: {:?}", result);
    }

    #[test]
    fn malformed_key_format_rejected() {
        for bad_key in ["", "NOTAPRO-KEY", "APIRO-", "random-garbage-string", "APIRO-SHORT", "APIRO-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"] {
            let result = verify_license_offline_with_key(bad_key, &test_public_key());
            assert!(result.is_err(), "should reject: {}", bad_key);
        }
    }

    #[test]
    fn perpetual_license_no_expiry_check() {
        let mut payload = sample_payload();
        payload.expires_at = None;
        let key = generate_with_key(&payload, &test_private_key());
        let result = verify_license_offline_with_key(&key, &test_public_key());
        assert!(result.is_ok(), "perpetual should pass: {:?}", result);
    }

    // === Tests legacy / robustesse ===

    #[test]
    fn roundtrip_verify() {
        let payload = sample_payload();
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let sig_b32 = sign_payload(&payload_bytes, &test_private_key());
        let payload_b32 = b32_encode(&payload_bytes);
        let key = format!("APIRO-{}-{}", payload_b32, sig_b32);
        let decoded = verify_license_offline(&key).expect("should verify");
        assert_eq!(decoded.license_id, payload.license_id);
        assert_eq!(decoded.tier, LicenseTier::Pro);
    }

    #[test]
    fn grouped_format_verify() {
        let payload = sample_payload();
        let key = encode_license_key(&payload, "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4").unwrap();
        assert!(key.starts_with("APIRO-"));
        let decoded = verify_license_offline(&key).expect("grouped should verify");
        assert_eq!(decoded.license_id, "lic_test123");
    }

    #[test]
    fn invalid_signature_fails() {
        let payload = sample_payload();
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let payload_b32 = b32_encode(&payload_bytes);
        let bad_sig = "A".repeat(SIG_B32_LEN);
        let key = format!("APIRO-{}-{}", payload_b32, bad_sig);
        assert!(matches!(
            verify_license_offline(&key),
            Err(LicenseError::InvalidSignature)
        ));
    }

    #[test]
    fn expired_fails() {
        let mut payload = sample_payload();
        payload.expires_at = Some(Utc.with_ymd_and_hms(2020, 1, 1, 0, 0, 0).unwrap());
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let sig_b32 = sign_payload(&payload_bytes, &test_private_key());
        let payload_b32 = b32_encode(&payload_bytes);
        let key = format!("APIRO-{}-{}", payload_b32, sig_b32);
        assert_eq!(verify_license_offline(&key), Err(LicenseError::Expired));
    }

    #[test]
    fn invalid_format() {
        assert!(verify_license_offline("BAD-KEY").is_err());
        assert!(verify_license_offline("").is_err());
        assert!(verify_license_offline("APIRO-SHORT").is_err());
    }

    #[test]
    fn fuzz_no_panic_on_garbage_input() {
        let garbage_inputs = vec![
            "APIRO-".to_string(),
            "".to_string(),
            "🔥💀".to_string(),
            "A".repeat(10000),
            format!("APIRO-{}-{}", "X".repeat(50), "Y".repeat(50)),
            format!("APIRO-{}-{}", "X".repeat(200), "A".repeat(SIG_B32_LEN)),
            "   APIRO-   ".to_string(),
            "NOTAPREFIX-12345-67890".to_string(),
        ];
        for input in garbage_inputs {
            let result = std::panic::catch_unwind(|| verify_license_offline(&input));
            assert!(result.is_ok(), "should not panic on {:?}", &input[..input.len().min(50)]);
            // Must be Err, never Ok and never panic
            assert!(result.unwrap().is_err(), "garbage should be Err");
        }
    }

    #[test]
    fn team_seats_preserved() {
        let mut payload = sample_payload();
        payload.tier = LicenseTier::Team;
        payload.seats = 5;
        let key = generate_with_key(&payload, &test_private_key());
        let decoded = verify_license_offline(&key).unwrap();
        assert_eq!(decoded.tier, LicenseTier::Team);
        assert_eq!(decoded.seats, 5);
    }
}
