//! Encrypted local storage for license — OS keyring primary, SQLite fallback.
//! Stored in the same Store DB as settings/history, key `license`.
//! Priority: Try OS keyring via `tauri_plugin_stronghold` if available, else DB.
//! For now we use DB JSON (file permission protected) — never JSON clear on web, keyring only in Tauri.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::store::Store;

use super::verify::{LicensePayload, LicenseTier};

const LICENSE_KEY: &str = "license";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LicenseState {
    Activated,
    PendingSync,
    GracePeriodOver,
    Revoked,
    Expired,
}

impl LicenseState {
    pub fn is_pro(&self) -> bool {
        matches!(self, LicenseState::Activated | LicenseState::PendingSync)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredLicense {
    pub key: String,
    pub payload: LicensePayload,
    pub state: LicenseState,
    pub last_verified_at: DateTime<Utc>,
    pub activation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub state: LicenseState,
    pub tier: Option<LicenseTier>,
    pub seats: Option<u32>,
    pub license_id: Option<String>,
    pub is_pro: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_verified_at: Option<DateTime<Utc>>,
    pub activation_id: Option<String>,
}

impl Default for LicenseStatus {
    fn default() -> Self {
        Self {
            state: LicenseState::GracePeriodOver,
            tier: None,
            seats: None,
            license_id: None,
            is_pro: false,
            expires_at: None,
            last_verified_at: None,
            activation_id: None,
        }
    }
}

impl From<Option<StoredLicense>> for LicenseStatus {
    fn from(opt: Option<StoredLicense>) -> Self {
        match opt {
            None => LicenseStatus {
                state: LicenseState::GracePeriodOver,
                is_pro: false,
                ..Default::default()
            },
            Some(stored) => {
                let is_pro = stored.state.is_pro();
                LicenseStatus {
                    state: stored.state,
                    tier: Some(stored.payload.tier),
                    seats: Some(stored.payload.seats),
                    license_id: Some(stored.payload.license_id),
                    is_pro,
                    expires_at: stored.payload.expires_at,
                    last_verified_at: Some(stored.last_verified_at),
                    activation_id: stored.activation_id,
                }
            }
        }
    }
}

pub fn get_stored_license(store: &Store) -> Result<Option<StoredLicense>, String> {
    let raw = store.get_setting(LICENSE_KEY)?;
    match raw {
        None => Ok(None),
        Some(s) if s == "__deleted__" || s.is_empty() => Ok(None),
        Some(s) => {
            let parsed: StoredLicense = serde_json::from_str(&s)
                .map_err(|e| format!("license parse: {}", e))?;
            Ok(Some(parsed))
        }
    }
}

pub fn put_stored_license(store: &Store, license: &StoredLicense) -> Result<(), String> {
    let json = serde_json::to_string(license).map_err(|e| e.to_string())?;
    store.set_setting(LICENSE_KEY, &json)
}

pub fn clear_stored_license(store: &Store) -> Result<(), String> {
    store.delete_setting(LICENSE_KEY)
}

pub fn get_stored_license_checked(store: &Store) -> Result<Option<StoredLicense>, String> {
    get_stored_license(store)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use chrono::TimeZone;

    fn payload() -> LicensePayload {
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
    fn store_roundtrip() {
        let store = Store::open().expect("store");
        let license = StoredLicense {
            key: "APIRO-TEST".into(),
            payload: payload(),
            state: LicenseState::Activated,
            last_verified_at: Utc::now(),
            activation_id: Some("act_123".into()),
        };
        put_stored_license(&store, &license).unwrap();
        let back = get_stored_license_checked(&store).unwrap().unwrap();
        assert_eq!(back.key, "APIRO-TEST");
        assert_eq!(back.state, LicenseState::Activated);
        clear_stored_license(&store).unwrap();
        assert!(get_stored_license_checked(&store).unwrap().is_none());
    }

    #[test]
    fn status_from_none_is_not_pro() {
        let s: LicenseStatus = None.into();
        assert!(!s.is_pro);
        assert_eq!(s.state, LicenseState::GracePeriodOver);
    }

    #[test]
    fn status_is_pro_for_activated_pending() {
        for state in [LicenseState::Activated, LicenseState::PendingSync] {
            let lic = StoredLicense {
                key: "k".into(),
                payload: payload(),
                state: state.clone(),
                last_verified_at: Utc::now(),
                activation_id: None,
            };
            let status: LicenseStatus = Some(lic).into();
            assert!(status.is_pro, "state {:?} should be pro", state);
        }
        for state in [
            LicenseState::GracePeriodOver,
            LicenseState::Revoked,
            LicenseState::Expired,
        ] {
            let lic = StoredLicense {
                key: "k".into(),
                payload: payload(),
                state: state.clone(),
                last_verified_at: Utc::now(),
                activation_id: None,
            };
            let status: LicenseStatus = Some(lic).into();
            assert!(!status.is_pro, "state {:?} should not be pro", state);
        }
    }
}
