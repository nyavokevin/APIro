//! Central gate — single enforcement point for tier limits.
//! Every gated Tauri command calls `check_gate` before mutating state.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::store::Store;

use super::store::{get_stored_license_checked, LicenseState};
use super::tiers::{effective_tier, Tier, TierLimits};

/// All gated actions — one arm per feature/resource.
/// Serialized as PascalCase strings from the frontend (e.g. "CreateCollection").
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GateAction {
    CreateCollection,
    CreateEnvironment,
    AddAssertion,
    UseMockServer,
    UseGraphQL,
    UseGrpc,
    RunCiCli,
    UseAiAssistant,
    ExportBrandedPdf,
    OpenFlowVisualizer,
    InviteTeamMember,
    SyncSharedSecrets,
}

impl GateAction {
    fn as_feature_key(&self) -> &'static str {
        match self {
            GateAction::CreateCollection => "collections",
            GateAction::CreateEnvironment => "environments",
            GateAction::AddAssertion => "assertions",
            GateAction::UseMockServer => "mock_server",
            GateAction::UseGraphQL => "graphql",
            GateAction::UseGrpc => "grpc",
            GateAction::RunCiCli => "ci_cli",
            GateAction::UseAiAssistant => "ai_assistant",
            GateAction::ExportBrandedPdf => "pdf_branding",
            GateAction::OpenFlowVisualizer => "flow_visualizer",
            GateAction::InviteTeamMember => "team_invite",
            GateAction::SyncSharedSecrets => "shared_secrets",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DenyReason {
    CollectionLimitReached { current: u32, max: u32 },
    EnvironmentLimitReached { current: u32, max: u32 },
    AssertionLimitReached { current: u32, max: u32 },
    FeatureNotInTier { feature: String },
    AiQuotaExhausted { used: u32, quota: u32, resets_at: DateTime<Utc> },
    SeatLimitReached { current: u32, max: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GateResult {
    Allowed,
    Denied {
        reason: DenyReason,
        #[serde(rename = "currentTier")]
        current_tier: Tier,
        #[serde(rename = "upgradeHint")]
        upgrade_hint: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStat {
    pub current: u32,
    pub max: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub tier: Tier,
    pub collections: UsageStat,
    pub environments: UsageStat,
    pub ai_assistant: UsageStat,
    pub mock_server_enabled: bool,
    pub graphql_enabled: bool,
    pub grpc_enabled: bool,
    pub ci_cli_enabled: bool,
    pub team_sharing_enabled: bool,
    pub advanced_environments_enabled: bool,
    pub flow_visualizer_enabled: bool,
    pub pdf_export_branding: bool,
    pub max_seats: Option<u32>,
}

/// Counts needed to evaluate a gate. Pure data — no I/O.
#[derive(Debug, Clone, Default)]
pub struct GateCounts {
    pub collections: u32,
    pub environments: u32,
    /// Current assertion count in the request being edited (pm.test occurrences)
    pub assertions: u32,
    pub ai_used: u32,
    pub ai_resets_at: Option<DateTime<Utc>>,
    pub seats_current: u32,
}

/// Pure gate evaluation — no Store, no FS. Used by tests and the live wrapper.
pub fn check_gate_pure(tier: Tier, action: &GateAction, counts: &GateCounts) -> GateResult {
    let limits = TierLimits::for_tier(tier);
    match action {
        GateAction::CreateCollection => {
            if let Some(max) = limits.max_collections {
                if counts.collections >= max {
                    return GateResult::Denied {
                        reason: DenyReason::CollectionLimitReached {
                            current: counts.collections,
                            max,
                        },
                        current_tier: tier,
                        upgrade_hint: "Upgrade to Pro for unlimited collections".into(),
                    };
                }
            }
            GateResult::Allowed
        }
        GateAction::CreateEnvironment => {
            if let Some(max) = limits.max_environments {
                if counts.environments >= max {
                    return GateResult::Denied {
                        reason: DenyReason::EnvironmentLimitReached {
                            current: counts.environments,
                            max,
                        },
                        current_tier: tier,
                        upgrade_hint: "Upgrade to Pro for unlimited environments".into(),
                    };
                }
            }
            GateResult::Allowed
        }
        GateAction::AddAssertion => {
            if let Some(max) = limits.max_assertions_per_request {
                if counts.assertions >= max {
                    return GateResult::Denied {
                        reason: DenyReason::AssertionLimitReached {
                            current: counts.assertions,
                            max,
                        },
                        current_tier: tier,
                        upgrade_hint: "Upgrade to Pro for unlimited assertions".into(),
                    };
                }
            }
            GateResult::Allowed
        }
        GateAction::UseMockServer => {
            if limits.mock_server_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "mock_server".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "Mock Server is a Pro feature".into(),
                }
            }
        }
        GateAction::UseGraphQL => {
            if limits.graphql_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "graphql".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "GraphQL is a Pro feature".into(),
                }
            }
        }
        GateAction::UseGrpc => {
            if limits.grpc_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "grpc".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "gRPC is a Pro feature".into(),
                }
            }
        }
        GateAction::RunCiCli => {
            if limits.ci_cli_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "ci_cli".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "CI CLI is a Pro feature".into(),
                }
            }
        }
        GateAction::UseAiAssistant => {
            if let Some(quota) = limits.ai_assistant_monthly_quota {
                if quota == 0 {
                    let resets_at = counts
                        .ai_resets_at
                        .unwrap_or_else(|| Utc::now() + chrono::Duration::days(30));
                    return GateResult::Denied {
                        reason: DenyReason::AiQuotaExhausted {
                            used: counts.ai_used,
                            quota,
                            resets_at: resets_at,
                        },
                        current_tier: tier,
                        upgrade_hint: "AI Assistant is a Pro feature".into(),
                    };
                }
                if counts.ai_used >= quota {
                    let resets_at = counts
                        .ai_resets_at
                        .unwrap_or_else(|| Utc::now() + chrono::Duration::days(30));
                    return GateResult::Denied {
                        reason: DenyReason::AiQuotaExhausted {
                            used: counts.ai_used,
                            quota,
                            resets_at: resets_at,
                        },
                        current_tier: tier,
                        upgrade_hint: "AI quota exhausted — upgrade to Team for 500/month".into(),
                    };
                }
            }
            GateResult::Allowed
        }
        GateAction::ExportBrandedPdf => {
            if limits.pdf_export_branding {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "pdf_branding".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "Branded PDF export is a Pro feature".into(),
                }
            }
        }
        GateAction::OpenFlowVisualizer => {
            if limits.flow_visualizer_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "flow_visualizer".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "Flow Visualizer is a Pro feature".into(),
                }
            }
        }
        GateAction::InviteTeamMember => {
            if !limits.team_sharing_enabled {
                return GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "team_sharing".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "Team sharing is a Team feature".into(),
                };
            }
            if let Some(max) = limits.max_seats {
                if counts.seats_current >= max {
                    return GateResult::Denied {
                        reason: DenyReason::SeatLimitReached {
                            current: counts.seats_current,
                            max,
                        },
                        current_tier: tier,
                        upgrade_hint: "Seat limit reached — purchase more seats".into(),
                    };
                }
            }
            GateResult::Allowed
        }
        GateAction::SyncSharedSecrets => {
            if limits.advanced_environments_enabled {
                GateResult::Allowed
            } else {
                GateResult::Denied {
                    reason: DenyReason::FeatureNotInTier {
                        feature: "shared_secrets".into(),
                    },
                    current_tier: tier,
                    upgrade_hint: "Shared secrets require a Team plan".into(),
                }
            }
        }
    }
}

// ---- Live helpers that read Store + FS ----

fn default_workspace() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("APIForge")
}

fn workspace_dir(store: &Store, override_dir: Option<String>) -> std::path::PathBuf {
    if let Some(d) = override_dir {
        return std::path::PathBuf::from(d);
    }
    store
        .get_setting("workspace_path")
        .ok()
        .flatten()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(default_workspace)
}

fn count_collections(dir: &std::path::Path) -> u32 {
    match crate::collections::read_tree(dir) {
        Ok(nodes) => nodes.len() as u32,
        Err(_) => 0,
    }
}

fn count_environments(store: &Store) -> u32 {
    match store.get_setting("environments") {
        Ok(Some(raw)) => {
            if raw.trim().is_empty() {
                return 0;
            }
            match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(serde_json::Value::Array(arr)) => arr.len() as u32,
                Ok(_) => 0,
                Err(_) => 0,
            }
        }
        _ => 0,
    }
}

fn get_license_tier(store: &Store) -> Tier {
    let opt = get_stored_license_checked(store).ok().flatten();
    let status: super::store::LicenseStatus = opt.into();
    // apply same expiry/grace logic as license_get_status for consistency
    // but effective_tier already handles state; we need to handle expiry/grace that changes is_pro
    // Mirror activate::license_get_status logic inline:
    let mut status = status;
    // Re-check grace and expiry if we have a stored license
    if let Ok(Some(stored)) = get_stored_license_checked(store) {
        const GRACE_DAYS: i64 = 7;
        let elapsed = Utc::now().signed_duration_since(stored.last_verified_at);
        let grace_over = stored.state == LicenseState::PendingSync && elapsed.num_days() > GRACE_DAYS;
        let expired = stored
            .payload
            .expires_at
            .map(|exp| Utc::now() > exp)
            .unwrap_or(false);
        if grace_over {
            status.state = LicenseState::GracePeriodOver;
        } else if expired {
            status.state = LicenseState::Expired;
        }
    }
    effective_tier(&status)
}

fn load_ai_counts(store: &Store, tier: Tier) -> (u32, Option<DateTime<Utc>>) {
    let limits = TierLimits::for_tier(tier);
    let quota = limits.ai_assistant_monthly_quota;
    if quota.is_none() {
        return (0, None);
    }
    // Load quota state if present
    match super::ai_quota::load_ai_quota_state(store) {
        Ok(state) => {
            let now = Utc::now();
            let resets_at = state.period_start + chrono::Duration::days(30);
            if now > resets_at {
                (0, Some(now + chrono::Duration::days(30)))
            } else {
                (state.used_this_period, Some(resets_at))
            }
        }
        Err(_) => (0, Some(Utc::now() + chrono::Duration::days(30))),
    }
}

fn current_counts(
    store: &Store,
    dir_override: Option<String>,
    assertion_count: Option<u32>,
) -> GateCounts {
    let dir = workspace_dir(store, dir_override);
    let tier = get_license_tier(store);
    let (ai_used, ai_resets_at) = load_ai_counts(store, tier);
    // Seats: current = 1 (owner) plus stored team members if any? For now assume 1.
    // If Team, read seats from payload but current is tracked elsewhere.
    GateCounts {
        collections: count_collections(&dir),
        environments: count_environments(store),
        assertions: assertion_count.unwrap_or(0),
        ai_used,
        ai_resets_at,
        seats_current: 1,
    }
}

pub fn build_usage_summary(store: &Store, dir_override: Option<String>) -> UsageSummary {
    let tier = get_license_tier(store);
    let limits = TierLimits::for_tier(tier);
    let dir = workspace_dir(store, dir_override);
    let collections_current = count_collections(&dir);
    let environments_current = count_environments(store);
    let (ai_used, _) = load_ai_counts(store, tier);
    // compute ai resets for display? we show max quota
    UsageSummary {
        tier,
        collections: UsageStat {
            current: collections_current,
            max: limits.max_collections,
        },
        environments: UsageStat {
            current: environments_current,
            max: limits.max_environments,
        },
        ai_assistant: UsageStat {
            current: ai_used,
            max: limits.ai_assistant_monthly_quota,
        },
        mock_server_enabled: limits.mock_server_enabled,
        graphql_enabled: limits.graphql_enabled,
        grpc_enabled: limits.grpc_enabled,
        ci_cli_enabled: limits.ci_cli_enabled,
        team_sharing_enabled: limits.team_sharing_enabled,
        advanced_environments_enabled: limits.advanced_environments_enabled,
        flow_visualizer_enabled: limits.flow_visualizer_enabled,
        pdf_export_branding: limits.pdf_export_branding,
        max_seats: limits.max_seats,
    }
}

// ---- Tauri commands ----

#[tauri::command]
pub fn license_check_gate(
    action: String,
    store: tauri::State<Store>,
    assertion_count: Option<u32>,
    dir: Option<String>,
) -> Result<GateResult, String> {
    let parsed: GateAction = serde_json::from_str(&format!("\"{}\"", action))
        .map_err(|e| format!("unknown gate action '{}': {}", action, e))?;
    // Alternative: try case-insensitive manual mapping
    let parsed = match parsed {
        _ => parsed,
    };
    // For robustness, also handle camelCase vs PascalCase by matching string directly if deserialize failed?
    // The above already handles PascalCase because GateAction uses default PascalCase variant names.
    let tier = get_license_tier(&store);
    let counts = current_counts(&store, dir, assertion_count);
    Ok(check_gate_pure(tier, &parsed, &counts))
}

#[tauri::command]
pub fn license_check_gate_typed(
    action: GateAction,
    store: tauri::State<Store>,
    assertion_count: Option<u32>,
    dir: Option<String>,
) -> Result<GateResult, String> {
    let tier = get_license_tier(&store);
    let counts = current_counts(&store, dir, assertion_count);
    Ok(check_gate_pure(tier, &action, &counts))
}

#[tauri::command]
pub fn license_get_usage_summary(
    store: tauri::State<Store>,
    dir: Option<String>,
) -> Result<UsageSummary, String> {
    Ok(build_usage_summary(&store, dir))
}

#[cfg(test)]
mod gate_tests {
    use super::*;
    use chrono::{Duration, TimeZone};

    fn counts_with(collections: u32, envs: u32, assertions: u32) -> GateCounts {
        GateCounts {
            collections,
            environments: envs,
            assertions,
            ai_used: 0,
            ai_resets_at: Some(Utc.with_ymd_and_hms(2026, 9, 30, 0, 0, 0).unwrap()),
            seats_current: 1,
        }
    }

    #[test]
    fn free_tier_blocks_4th_collection() {
        let counts = counts_with(3, 0, 0);
        let result = check_gate_pure(Tier::Free, &GateAction::CreateCollection, &counts);
        assert!(matches!(result, GateResult::Denied { .. }), "3/3 should deny 4th: {:?}", result);
        if let GateResult::Denied { reason, .. } = result {
            assert!(matches!(reason, DenyReason::CollectionLimitReached { current: 3, max: 3 }));
        }
    }

    #[test]
    fn free_tier_allows_3rd_collection() {
        let counts = counts_with(2, 0, 0);
        let result = check_gate_pure(Tier::Free, &GateAction::CreateCollection, &counts);
        assert!(matches!(result, GateResult::Allowed));
    }

    #[test]
    fn pro_tier_unlimited_collections() {
        let counts = counts_with(50, 0, 0);
        let result = check_gate_pure(Tier::Pro, &GateAction::CreateCollection, &counts);
        assert!(matches!(result, GateResult::Allowed), "pro should allow 50: {:?}", result);
    }

    #[test]
    fn team_unlimited_collections() {
        let counts = counts_with(500, 0, 0);
        let result = check_gate_pure(Tier::Team, &GateAction::CreateCollection, &counts);
        assert!(matches!(result, GateResult::Allowed));
    }

    #[test]
    fn pending_sync_treated_as_activated_tier() {
        use crate::license::store::{LicenseStatus, StoredLicense};
        use crate::license::verify::{LicensePayload, LicenseTier};
        let payload = LicensePayload {
            license_id: "lic_test".into(),
            tier: LicenseTier::Pro,
            seats: 1,
            issued_at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            expires_at: None,
            customer_email: None,
        };
        let stored = StoredLicense {
            key: "k".into(),
            payload,
            state: LicenseState::PendingSync,
            last_verified_at: Utc::now(),
            activation_id: None,
        };
        let status: LicenseStatus = Some(stored).into();
        let tier = effective_tier(&status);
        assert_eq!(tier, Tier::Pro);
        let counts = counts_with(0, 0, 0);
        let result = check_gate_pure(tier, &GateAction::UseMockServer, &counts);
        assert!(matches!(result, GateResult::Allowed), "grace period should be pro");
    }

    #[test]
    fn free_blocks_mock_server() {
        let counts = counts_with(0, 0, 0);
        let result = check_gate_pure(Tier::Free, &GateAction::UseMockServer, &counts);
        assert!(matches!(result, GateResult::Denied { .. }));
    }

    #[test]
    fn free_blocks_graphql_and_grpc() {
        let c = counts_with(0, 0, 0);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::UseGraphQL, &c),
            GateResult::Denied { .. }
        ));
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::UseGrpc, &c),
            GateResult::Denied { .. }
        ));
        assert!(matches!(
            check_gate_pure(Tier::Pro, &GateAction::UseGraphQL, &c),
            GateResult::Allowed
        ));
    }

    #[test]
    fn free_environment_limit() {
        let counts = counts_with(0, 2, 0);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::CreateEnvironment, &counts),
            GateResult::Denied { .. }
        ));
        let counts2 = counts_with(0, 1, 0);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::CreateEnvironment, &counts2),
            GateResult::Allowed
        ));
    }

    #[test]
    fn assertion_limit() {
        let counts = counts_with(0, 0, 5);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::AddAssertion, &counts),
            GateResult::Denied { .. }
        ));
        let counts2 = counts_with(0, 0, 4);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::AddAssertion, &counts2),
            GateResult::Allowed
        ));
        let counts3 = counts_with(0, 0, 100);
        assert!(matches!(
            check_gate_pure(Tier::Pro, &GateAction::AddAssertion, &counts3),
            GateResult::Allowed
        ));
    }

    #[test]
    fn ai_assistant_free_disabled() {
        let counts = counts_with(0, 0, 0);
        let result = check_gate_pure(Tier::Free, &GateAction::UseAiAssistant, &counts);
        assert!(matches!(result, GateResult::Denied { .. }), "free ai should be denied");
    }

    #[test]
    fn ai_quota_exhausted_pro() {
        let mut counts = counts_with(0, 0, 0);
        counts.ai_used = 100;
        let result = check_gate_pure(Tier::Pro, &GateAction::UseAiAssistant, &counts);
        assert!(matches!(result, GateResult::Denied { .. }), "pro at 100/100 should deny");
        counts.ai_used = 99;
        let result2 = check_gate_pure(Tier::Pro, &GateAction::UseAiAssistant, &counts);
        assert!(matches!(result2, GateResult::Allowed));
    }

    #[test]
    fn team_invite_blocked_for_free_pro() {
        let c = counts_with(0, 0, 0);
        assert!(matches!(
            check_gate_pure(Tier::Free, &GateAction::InviteTeamMember, &c),
            GateResult::Denied { .. }
        ));
        assert!(matches!(
            check_gate_pure(Tier::Pro, &GateAction::InviteTeamMember, &c),
            GateResult::Denied { .. }
        ));
        assert!(matches!(
            check_gate_pure(Tier::Team, &GateAction::InviteTeamMember, &c),
            GateResult::Allowed
        ));
    }

    #[test]
    fn downgrade_never_deletes_has_no_side_effect() {
        // This is a property test: handle_downgrade must not mutate counts.
        // Gate itself is pure, so calling it doesn't change counts.
        let counts = counts_with(10, 0, 0);
        let before = counts.collections;
        let _ = check_gate_pure(Tier::Free, &GateAction::CreateCollection, &counts);
        assert_eq!(counts.collections, before);
        // Pro with 10 stays allowed, switching to Free perspective still shows 10 current
        let result = check_gate_pure(Tier::Free, &GateAction::CreateCollection, &counts);
        if let GateResult::Denied { reason, .. } = result {
            match reason {
                DenyReason::CollectionLimitReached { current, max } => {
                    assert_eq!(current, 10);
                    assert_eq!(max, 3);
                }
                _ => panic!("unexpected reason"),
            }
        } else {
            panic!("should be denied");
        }
    }
}
