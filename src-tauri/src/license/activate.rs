//! Activation flow — offline verify + online confirmation + grace period
//! Respects offline-first: fail open for previously-activated, grace 7 days for pending.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::store::Store;

use super::fingerprint::get_device_fingerprint;
use super::store::{
    clear_stored_license, get_stored_license, get_stored_license_checked, put_stored_license,
    LicenseState, LicenseStatus, StoredLicense,
};
use super::verify::{verify_license_offline, LicenseError};

const GRACE_DAYS: i64 = 7;
const REVALIDATE_DAYS: i64 = 14;

fn server_base_url() -> String {
    std::env::var("APIRO_LICENSE_SERVER")
        .or_else(|_| std::env::var("APIRO_LICENSE_URL"))
        .unwrap_or_else(|_| "https://api.apiro.dev".into())
}

#[derive(Debug, Serialize, Deserialize)]
struct ActivateRequest {
    license_key: String,
    device_fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ActivateResponse {
    activation_id: Option<String>,
    status: Option<String>,
}

#[derive(Debug)]
enum ActivationOutcome {
    Activated { activation_id: Option<String> },
    NetworkError(String),
    Rejected(String),
}

async fn activate_online(key: &str, fingerprint: &str) -> ActivationOutcome {
    let url = format!("{}/v1/license/activate", server_base_url().trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return ActivationOutcome::NetworkError(e.to_string()),
    };
    let body = ActivateRequest {
        license_key: key.to_string(),
        device_fingerprint: fingerprint.to_string(),
    };
    match client.post(&url).json(&body).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                let parsed: Result<ActivateResponse, _> = resp.json().await;
                match parsed {
                    Ok(r) => ActivationOutcome::Activated {
                        activation_id: r.activation_id,
                    },
                    Err(_) => ActivationOutcome::Activated {
                        activation_id: None,
                    },
                }
            } else if resp.status().as_u16() == 409 {
                let text = resp.text().await.unwrap_or_else(|_| "device limit exceeded".into());
                ActivationOutcome::Rejected(text)
            } else if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
                let text = resp.text().await.unwrap_or_else(|_| "license revoked or invalid".into());
                ActivationOutcome::Rejected(text)
            } else {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if text.to_lowercase().contains("revoked")
                    || text.to_lowercase().contains("limit")
                {
                    ActivationOutcome::Rejected(text)
                } else {
                    ActivationOutcome::NetworkError(format!("server {}: {}", status, text))
                }
            }
        }
        Err(e) => {
            // reqwest error — treat as network if is_connect/is_timeout
            if e.is_connect() || e.is_timeout() {
                ActivationOutcome::NetworkError(e.to_string())
            } else {
                ActivationOutcome::NetworkError(e.to_string())
            }
        }
    }
}

async fn deactivate_online(key: &str, activation_id: &Option<String>) -> Result<(), String> {
    let url = format!("{}/v1/license/deactivate", server_base_url().trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "license_key": key,
        "activation_id": activation_id,
        "device_fingerprint": get_device_fingerprint(),
    });
    match client.post(&url).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => Ok(()),
        Ok(resp) => Err(format!("deactivate failed: {}", resp.status())),
        Err(e) => Err(e.to_string()),
    }
}

async fn revalidate_online(key: &str, activation_id: &Option<String>) -> Result<LicenseState, String> {
    let url = format!("{}/v1/license/revalidate", server_base_url().trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "license_key": key,
        "activation_id": activation_id,
        "device_fingerprint": get_device_fingerprint(),
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("activated");
        match status {
            "revoked" => Ok(LicenseState::Revoked),
            "expired" => Ok(LicenseState::Expired),
            "grace_period_over" => Ok(LicenseState::GracePeriodOver),
            _ => Ok(LicenseState::Activated),
        }
    } else if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
        Ok(LicenseState::Revoked)
    } else {
        Err(format!("revalidate failed: {}", resp.status()))
    }
}

fn is_grace_over(stored: &StoredLicense) -> bool {
    let elapsed = Utc::now().signed_duration_since(stored.last_verified_at);
    elapsed.num_days() > GRACE_DAYS
}

fn is_revalidate_due(stored: &StoredLicense) -> bool {
    let elapsed = Utc::now().signed_duration_since(stored.last_verified_at);
    elapsed.num_days() >= REVALIDATE_DAYS
}

/// Tauri command: get current license status (always succeeds, returns free if none)
#[tauri::command]
pub fn license_get_status(store: tauri::State<Store>) -> Result<LicenseStatus, String> {
    let opt = get_stored_license_checked(&store).map_err(|e| e.to_string())?;
    // Check grace expiry for PendingSync
    if let Some(ref stored) = opt {
        if stored.state == LicenseState::PendingSync && is_grace_over(stored) {
            // Downgrade to GracePeriodOver in DB lazily? Keep in memory status only for now
            // Caller can persist via background check; here we just report
            let mut status: LicenseStatus = Some(stored.clone()).into();
            status.state = LicenseState::GracePeriodOver;
            status.is_pro = false;
            return Ok(status);
        }
        // Check offline expiry
        if let Some(exp) = stored.payload.expires_at {
            if Utc::now() > exp {
                let mut status: LicenseStatus = Some(stored.clone()).into();
                status.state = LicenseState::Expired;
                status.is_pro = false;
                return Ok(status);
            }
        }
    }
    Ok(opt.into())
}

async fn do_activate(key: &str, store: &Store) -> Result<LicenseStatus, String> {
    let payload = verify_license_offline(key).map_err(|e| match e {
        LicenseError::InvalidFormat(s) => format!("Invalid format: {}", s),
        LicenseError::InvalidBase32(s) => format!("Invalid key: {}", s),
        LicenseError::InvalidSignature => "Invalid signature — key not issued by APIro".into(),
        LicenseError::InvalidPayload(s) => format!("Invalid payload: {}", s),
        LicenseError::Expired => "License expired".into(),
    })?;

    if let Some(exp) = payload.expires_at {
        if Utc::now() > exp {
            return Err("License expired".into());
        }
    }

    let fingerprint = get_device_fingerprint();
    let now = Utc::now();

    let mut stored = StoredLicense {
        key: key.to_string(),
        payload: payload.clone(),
        state: LicenseState::PendingSync,
        last_verified_at: now,
        activation_id: None,
    };
    put_stored_license(store, &stored)?;

    match activate_online(key, &fingerprint).await {
        ActivationOutcome::Activated { activation_id } => {
            stored.state = LicenseState::Activated;
            stored.last_verified_at = Utc::now();
            stored.activation_id = activation_id;
            put_stored_license(store, &stored)?;
        }
        ActivationOutcome::NetworkError(err) => {
            eprintln!("[license] activate online failed (offline grace): {}", err);
        }
        ActivationOutcome::Rejected(reason) => {
            clear_stored_license(store)?;
            return Err(format!("Activation rejected: {}", reason));
        }
    }

    let opt = get_stored_license_checked(store)?;
    Ok(opt.into())
}

/// Tauri command: activate license (needs internet, but graceful if offline)
#[tauri::command]
pub async fn license_activate(
    key: String,
    store: tauri::State<'_, Store>,
) -> Result<LicenseStatus, String> {
    do_activate(&key, &store).await
}

#[tauri::command]
pub async fn license_deactivate(store: tauri::State<'_, Store>) -> Result<(), String> {
    let stored = get_stored_license_checked(&store)?;
    if let Some(s) = stored {
        // Try online deactivation best-effort, ignore network errors
        if let Err(e) = deactivate_online(&s.key, &s.activation_id).await {
            eprintln!("[license] deactivate online failed (ignored): {}", e);
        }
        clear_stored_license(&store)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn license_revalidate(store: tauri::State<'_, Store>) -> Result<LicenseStatus, String> {
    let opt = get_stored_license_checked(&store)?;
    let Some(mut stored) = opt else {
        return Ok(LicenseStatus::default());
    };

    // If not due, just return current
    if !is_revalidate_due(&stored) && stored.state == LicenseState::Activated {
        return Ok(Some(stored).into());
    }

    // If PendingSync and grace over, downgrade
    if stored.state == LicenseState::PendingSync && is_grace_over(&stored) {
        stored.state = LicenseState::GracePeriodOver;
        put_stored_license(&store, &stored)?;
        return Ok(Some(stored).into());
    }

    // Try online revalidation
    match revalidate_online(&stored.key, &stored.activation_id).await {
        Ok(new_state) => {
            stored.state = new_state;
            stored.last_verified_at = Utc::now();
            put_stored_license(&store, &stored)?;
            // If revoked/expired, keep stored but status is_pro false
        }
        Err(e) => {
            eprintln!("[license] revalidate failed (keep current): {}", e);
            // Fail open: keep current state
        }
    }

    let opt = get_stored_license_checked(&store)?;
    Ok(opt.into())
}

/// Background recheck called at app startup — non-blocking, fail open.
pub async fn background_license_recheck(store: Store) {
    let opt = match get_stored_license_checked(&store) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[license] background check get failed: {}", e);
            return;
        }
    };
    let Some(stored) = opt else {
        return;
    };

    // Only recheck if due or pending
    let should_check = is_revalidate_due(&stored) || stored.state == LicenseState::PendingSync;
    if !should_check {
        return;
    }

    // Grace over handling for pending without network
    if stored.state == LicenseState::PendingSync && is_grace_over(&stored) {
        let mut updated = stored.clone();
        updated.state = LicenseState::GracePeriodOver;
        let _ = put_stored_license(&store, &updated);
        return;
    }

    // Try online
    match revalidate_online(&stored.key, &stored.activation_id).await {
        Ok(new_state) => {
            let mut updated = stored;
            updated.state = new_state;
            updated.last_verified_at = Utc::now();
            let _ = put_stored_license(&store, &updated);
        }
        Err(e) => {
            eprintln!("[license] background revalidate network fail (keep): {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use chrono::TimeZone;
    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn payload() -> super::super::verify::LicensePayload {
        use super::super::verify::{LicensePayload, LicenseTier};
        LicensePayload {
            license_id: "lic_test".into(),
            tier: LicenseTier::Pro,
            seats: 1,
            issued_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            expires_at: None,
            customer_email: None,
        }
    }

    #[test]
    fn grace_detection() {
        let stored = StoredLicense {
            key: "k".into(),
            payload: payload(),
            state: LicenseState::PendingSync,
            last_verified_at: Utc::now() - Duration::days(8),
            activation_id: None,
        };
        assert!(is_grace_over(&stored));
        let stored2 = StoredLicense {
            last_verified_at: Utc::now() - Duration::days(2),
            ..stored
        };
        assert!(!is_grace_over(&stored2));
    }

    #[test]
    fn keyring_roundtrip() {
        // Touche le vrai Store (SQLite) — isolé via clé unique
        let store = Store::open().expect("store");
        let test_key = format!("APIRO-TEST-{}", uuid::Uuid::new_v4());
        let lic = StoredLicense {
            key: test_key.clone(),
            payload: payload(),
            state: LicenseState::Activated,
            last_verified_at: Utc::now(),
            activation_id: Some("act_test_123".into()),
        };
        put_stored_license(&store, &lic).unwrap();
        let loaded = get_stored_license_checked(&store).unwrap().unwrap();
        assert_eq!(loaded.key, test_key);
        clear_stored_license(&store).unwrap();
        assert!(get_stored_license_checked(&store).unwrap().is_none());
    }

    // Activation flow with mock server (requires mockito + tokio)
    #[cfg(feature = "mockito_tests")]
    mod mock_server_tests {
        // These tests are gated behind feature to avoid pulling mockito in default CI.
        // Run with: cargo test --features mockito_tests
    }

    #[tokio::test]
    async fn activation_succeeds_when_server_confirms() {
        let _guard = ENV_LOCK.lock().unwrap();
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/v1/license/activate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"activation_id":"act_123","status":"activated"}"#)
            .create_async()
            .await;
        std::env::set_var("APIRO_LICENSE_SERVER", server.url());
        let payload = payload();
        let key = {
            let sk_hex = "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4";
            crate::license::verify::encode_license_key(&payload, sk_hex).unwrap()
        };
        let store = Store::open().unwrap();
        let _ = clear_stored_license(&store);
        let result = do_activate(&key, &store).await;
        std::env::remove_var("APIRO_LICENSE_SERVER");
        mock.assert_async().await;
        assert!(result.is_ok(), "should activate: {:?}", result);
        assert_eq!(result.unwrap().state, LicenseState::Activated);
        let _ = clear_stored_license(&store);
    }

    #[tokio::test]
    async fn activation_falls_back_to_grace_period_offline() {
        let _guard = ENV_LOCK.lock().unwrap();
        let mut server = mockito::Server::new_async().await;
        let _mock = server
            .mock("POST", "/v1/license/activate")
            .with_status(500)
            .with_body("internal error")
            .create_async()
            .await;
        std::env::set_var("APIRO_LICENSE_SERVER", server.url());
        let payload = payload();
        let key = {
            let sk_hex = "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4";
            crate::license::verify::encode_license_key(&payload, sk_hex).unwrap()
        };
        let store = Store::open().unwrap();
        let _ = clear_stored_license(&store);
        let result = do_activate(&key, &store).await;
        std::env::remove_var("APIRO_LICENSE_SERVER");
        assert!(result.is_ok(), "offline should not block");
        assert_eq!(result.unwrap().state, LicenseState::PendingSync);
        let _ = clear_stored_license(&store);
    }

    #[tokio::test]
    async fn server_rejection_prevents_activation() {
        let _guard = ENV_LOCK.lock().unwrap();
        let mut server = mockito::Server::new_async().await;
        let _mock = server
            .mock("POST", "/v1/license/activate")
            .with_status(409)
            .with_header("content-type", "application/json")
            .with_body(r#"{"error":"seat_limit_exceeded"}"#)
            .create_async()
            .await;
        std::env::set_var("APIRO_LICENSE_SERVER", server.url());
        let payload = payload();
        let key = {
            let sk_hex = "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4";
            crate::license::verify::encode_license_key(&payload, sk_hex).unwrap()
        };
        let store = Store::open().unwrap();
        let _ = clear_stored_license(&store);
        let result = do_activate(&key, &store).await;
        std::env::remove_var("APIRO_LICENSE_SERVER");
        assert!(result.is_err(), "rejection should err");
        let store2 = Store::open().unwrap();
        assert!(get_stored_license_checked(&store2).unwrap().is_none());
    }
}
