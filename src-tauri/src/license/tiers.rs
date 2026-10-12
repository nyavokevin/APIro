//! Single source of truth for tier limits. All numbers live here.

use serde::{Deserialize, Serialize};

use super::store::{LicenseState, LicenseStatus};
use super::verify::LicenseTier;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Free,
    Pro,
    Team,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierLimits {
    pub max_collections: Option<u32>,
    pub max_environments: Option<u32>,
    pub max_assertions_per_request: Option<u32>,
    pub max_seats: Option<u32>,
    pub mock_server_enabled: bool,
    pub graphql_enabled: bool,
    pub grpc_enabled: bool,
    pub ci_cli_enabled: bool,
    pub team_sharing_enabled: bool,
    pub advanced_environments_enabled: bool,
    pub ai_assistant_monthly_quota: Option<u32>,
    pub pdf_export_branding: bool,
    pub flow_visualizer_enabled: bool,
}

impl TierLimits {
    pub fn for_tier(tier: Tier) -> Self {
        match tier {
            Tier::Free => TierLimits {
                max_collections: Some(3),
                max_environments: Some(2),
                max_assertions_per_request: Some(5),
                max_seats: Some(1),
                mock_server_enabled: false,
                graphql_enabled: false,
                grpc_enabled: false,
                ci_cli_enabled: false,
                team_sharing_enabled: false,
                advanced_environments_enabled: false,
                ai_assistant_monthly_quota: Some(0),
                pdf_export_branding: false,
                flow_visualizer_enabled: false,
            },
            Tier::Pro => TierLimits {
                max_collections: None,
                max_environments: None,
                max_assertions_per_request: None,
                max_seats: Some(1),
                mock_server_enabled: true,
                graphql_enabled: true,
                grpc_enabled: true,
                ci_cli_enabled: true,
                team_sharing_enabled: false,
                advanced_environments_enabled: false,
                ai_assistant_monthly_quota: Some(100),
                pdf_export_branding: true,
                flow_visualizer_enabled: true,
            },
            Tier::Team => {
                let base = TierLimits::for_tier(Tier::Pro);
                TierLimits {
                    max_seats: None,
                    team_sharing_enabled: true,
                    advanced_environments_enabled: true,
                    ai_assistant_monthly_quota: Some(500),
                    ..base
                }
            }
        }
    }
}

/// Grace period logic — the ONLY place that decides tier from license state.
/// Fail open: PendingSync keeps the real tier, everything else -> Free.
pub fn effective_tier(status: &LicenseStatus) -> Tier {
    match status.state {
        LicenseState::Activated | LicenseState::PendingSync => match &status.tier {
            Some(LicenseTier::Team) => Tier::Team,
            Some(LicenseTier::Pro) => Tier::Pro,
            None => Tier::Free,
        },
        LicenseState::GracePeriodOver
        | LicenseState::Revoked
        | LicenseState::Expired => Tier::Free,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    use super::super::verify::LicensePayload;
    use super::super::store::StoredLicense;

    fn payload(tier: LicenseTier) -> LicensePayload {
        LicensePayload {
            license_id: "lic_test".into(),
            tier,
            seats: 1,
            issued_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            expires_at: None,
            customer_email: None,
        }
    }

    #[test]
    fn free_limits_correct() {
        let l = TierLimits::for_tier(Tier::Free);
        assert_eq!(l.max_collections, Some(3));
        assert_eq!(l.max_environments, Some(2));
        assert_eq!(l.max_assertions_per_request, Some(5));
        assert!(!l.mock_server_enabled);
        assert_eq!(l.ai_assistant_monthly_quota, Some(0));
    }

    #[test]
    fn pro_unlimited_collections() {
        let l = TierLimits::for_tier(Tier::Pro);
        assert_eq!(l.max_collections, None);
        assert_eq!(l.max_environments, None);
        assert_eq!(l.max_assertions_per_request, None);
        assert!(l.mock_server_enabled);
        assert_eq!(l.ai_assistant_monthly_quota, Some(100));
    }

    #[test]
    fn team_inherits_pro_plus_team_flags() {
        let l = TierLimits::for_tier(Tier::Team);
        assert_eq!(l.max_collections, None);
        assert!(l.team_sharing_enabled);
        assert!(l.advanced_environments_enabled);
        assert_eq!(l.ai_assistant_monthly_quota, Some(500));
        assert_eq!(l.max_seats, None);
    }

    #[test]
    fn effective_tier_pending_sync_is_pro() {
        let stored = StoredLicense {
            key: "k".into(),
            payload: payload(LicenseTier::Pro),
            state: LicenseState::PendingSync,
            last_verified_at: Utc::now(),
            activation_id: None,
        };
        let status: LicenseStatus = Some(stored).into();
        assert_eq!(effective_tier(&status), Tier::Pro);
    }

    #[test]
    fn effective_tier_grace_over_is_free() {
        let stored = StoredLicense {
            key: "k".into(),
            payload: payload(LicenseTier::Pro),
            state: LicenseState::GracePeriodOver,
            last_verified_at: Utc::now(),
            activation_id: None,
        };
        let status: LicenseStatus = Some(stored).into();
        assert_eq!(effective_tier(&status), Tier::Free);
    }

    #[test]
    fn effective_tier_none_is_free() {
        let status: LicenseStatus = None.into();
        assert_eq!(effective_tier(&status), Tier::Free);
    }
}
