//! AI assistant monthly quota — stored in SQLite settings, resets every 30 days.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::store::Store;

use super::tiers::{effective_tier, Tier, TierLimits};

const AI_QUOTA_KEY: &str = "ai_quota";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiQuotaState {
    pub used_this_period: u32,
    pub period_start: DateTime<Utc>,
}

impl Default for AiQuotaState {
    fn default() -> Self {
        Self {
            used_this_period: 0,
            period_start: Utc::now(),
        }
    }
}

pub fn load_ai_quota_state(store: &Store) -> Result<AiQuotaState, String> {
    let raw = store.get_setting(AI_QUOTA_KEY)?;
    match raw {
        None => Ok(AiQuotaState::default()),
        Some(s) if s.is_empty() => Ok(AiQuotaState::default()),
        Some(s) => {
            let parsed: AiQuotaState =
                serde_json::from_str(&s).map_err(|e| format!("ai_quota parse: {}", e))?;
            Ok(parsed)
        }
    }
}

pub fn save_ai_quota_state(store: &Store, state: &AiQuotaState) -> Result<(), String> {
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    store.set_setting(AI_QUOTA_KEY, &json)
}

/// Pure helper: given a mutable state and tier, reset if period elapsed.
/// Returns true if reset happened.
pub fn maybe_reset_period(state: &mut AiQuotaState) -> bool {
    let resets_at = state.period_start + Duration::days(30);
    if Utc::now() > resets_at {
        state.used_this_period = 0;
        state.period_start = Utc::now();
        true
    } else {
        false
    }
}

/// Pure helper used by tests: try to consume one quota unit against a state + tier.
pub fn consume_ai_quota_with_state(
    state: &mut AiQuotaState,
    tier: Tier,
) -> Result<(), AiQuotaError> {
    maybe_reset_period(state);
    let limits = TierLimits::for_tier(tier);
    if let Some(quota) = limits.ai_assistant_monthly_quota {
        if quota == 0 {
            return Err(AiQuotaError::QuotaExhausted {
                used: state.used_this_period,
                quota,
                resets_at: state.period_start + Duration::days(30),
            });
        }
        if state.used_this_period >= quota {
            return Err(AiQuotaError::QuotaExhausted {
                used: state.used_this_period,
                quota,
                resets_at: state.period_start + Duration::days(30),
            });
        }
    }
    state.used_this_period += 1;
    Ok(())
}

#[derive(Debug, Clone)]
pub enum AiQuotaError {
    QuotaExhausted { used: u32, quota: u32, resets_at: DateTime<Utc> },
}

impl std::fmt::Display for AiQuotaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiQuotaError::QuotaExhausted { used, quota, resets_at } => {
                write!(f, "AI quota exhausted {}/{} resets {}", used, quota, resets_at)
            }
        }
    }
}

impl std::error::Error for AiQuotaError {}

/// Consume one AI quota unit for the current tier, persisting to Store.
/// Resets the period automatically if 30 days have elapsed.
/// Returns error if quota exhausted or disabled (Free).
pub fn consume_ai_quota(store: &Store) -> Result<(), String> {
    let status: super::store::LicenseStatus =
        super::store::get_stored_license_checked(store)
            .ok()
            .flatten()
            .into();
    // Apply same expiry/grace handling as gate
    let mut status = status;
    if let Ok(Some(stored)) = super::store::get_stored_license_checked(store) {
        const GRACE_DAYS: i64 = 7;
        let elapsed = Utc::now().signed_duration_since(stored.last_verified_at);
        let grace_over = stored.state == super::store::LicenseState::PendingSync && elapsed.num_days() > GRACE_DAYS;
        let expired = stored.payload.expires_at.map(|exp| Utc::now() > exp).unwrap_or(false);
        if grace_over {
            status.state = super::store::LicenseState::GracePeriodOver;
        } else if expired {
            status.state = super::store::LicenseState::Expired;
        }
    }
    let tier = effective_tier(&status);
    let mut state = load_ai_quota_state(store)?;
    maybe_reset_period(&mut state);
    let limits = TierLimits::for_tier(tier);
    if let Some(quota) = limits.ai_assistant_monthly_quota {
        if quota == 0 {
            return Err(format!(
                "AI Assistant disabled on Free plan (0/{})",
                quota
            ));
        }
        if state.used_this_period >= quota {
            let resets_at = state.period_start + Duration::days(30);
            return Err(format!(
                "AI quota exhausted {}/{} resets at {}",
                state.used_this_period, quota, resets_at
            ));
        }
    }
    state.used_this_period += 1;
    save_ai_quota_state(store, &state)?;
    Ok(())
}

pub fn get_ai_quota_status(
    store: &Store,
) -> Result<(u32, Option<u32>, DateTime<Utc>), String> {
    let status: super::store::LicenseStatus =
        super::store::get_stored_license_checked(store)
            .ok()
            .flatten()
            .into();
    let mut status = status;
    if let Ok(Some(stored)) = super::store::get_stored_license_checked(store) {
        const GRACE_DAYS: i64 = 7;
        let elapsed = Utc::now().signed_duration_since(stored.last_verified_at);
        let grace_over = stored.state == super::store::LicenseState::PendingSync && elapsed.num_days() > GRACE_DAYS;
        let expired = stored.payload.expires_at.map(|exp| Utc::now() > exp).unwrap_or(false);
        if grace_over {
            status.state = super::store::LicenseState::GracePeriodOver;
        } else if expired {
            status.state = super::store::LicenseState::Expired;
        }
    }
    let tier = effective_tier(&status);
    let limits = TierLimits::for_tier(tier);
    let quota = limits.ai_assistant_monthly_quota;
    let mut state = load_ai_quota_state(store)?;
    maybe_reset_period(&mut state);
    let resets_at = state.period_start + Duration::days(30);
    Ok((state.used_this_period, quota, resets_at))
}

#[tauri::command]
pub fn license_consume_ai_quota(store: tauri::State<Store>) -> Result<(), String> {
    consume_ai_quota(&store)
}

#[tauri::command]
pub fn license_get_ai_quota(store: tauri::State<Store>) -> Result<AiQuotaStatus, String> {
    let (used, quota, resets_at) = get_ai_quota_status(&store)?;
    Ok(AiQuotaStatus {
        used,
        quota,
        resets_at,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQuotaStatus {
    pub used: u32,
    pub quota: Option<u32>,
    pub resets_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn ai_quota_resets_after_30_days() {
        let mut state = AiQuotaState {
            used_this_period: 100,
            period_start: Utc::now() - Duration::days(31),
        };
        let result = consume_ai_quota_with_state(&mut state, Tier::Pro);
        assert!(result.is_ok(), "should reset and allow: {:?}", result);
        assert_eq!(state.used_this_period, 1);
        // period_start should be recent
        assert!(state.period_start > Utc::now() - Duration::minutes(1));
    }

    #[test]
    fn ai_quota_exhausted_when_at_limit() {
        let mut state = AiQuotaState {
            used_this_period: 100,
            period_start: Utc::now(),
        };
        let result = consume_ai_quota_with_state(&mut state, Tier::Pro);
        assert!(result.is_err());
        assert_eq!(state.used_this_period, 100);
    }

    #[test]
    fn ai_free_disabled() {
        let mut state = AiQuotaState {
            used_this_period: 0,
            period_start: Utc::now(),
        };
        let result = consume_ai_quota_with_state(&mut state, Tier::Free);
        assert!(result.is_err());
    }

    #[test]
    fn ai_team_quota_larger() {
        let mut state = AiQuotaState {
            used_this_period: 100,
            period_start: Utc::now(),
        };
        // Pro at 100 should be exhausted, Team at 100 should still allow (500)
        assert!(consume_ai_quota_with_state(&mut state.clone(), Tier::Pro).is_err());
        assert!(consume_ai_quota_with_state(&mut state, Tier::Team).is_ok());
    }

    #[test]
    fn maybe_reset_no_reset_before_30_days() {
        let mut state = AiQuotaState {
            used_this_period: 10,
            period_start: Utc::now() - Duration::days(10),
        };
        let did = maybe_reset_period(&mut state);
        assert!(!did);
        assert_eq!(state.used_this_period, 10);
    }

    #[test]
    fn store_roundtrip() {
        let store = Store::open().expect("store");
        let state = AiQuotaState {
            used_this_period: 7,
            period_start: Utc.with_ymd_and_hms(2026, 9, 1, 12, 0, 0).unwrap(),
        };
        save_ai_quota_state(&store, &state).unwrap();
        let loaded = load_ai_quota_state(&store).unwrap();
        assert_eq!(loaded.used_this_period, 7);
        assert_eq!(loaded.period_start, state.period_start);
        // cleanup
        let _ = store.delete_setting(AI_QUOTA_KEY);
    }
}
