//! Downgrade handling — never deletes data, only informs.

use serde::{Deserialize, Serialize};

use super::tiers::{Tier, TierLimits};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DowngradeNotice {
    OverLimit {
        resource: String,
        current: u32,
        max: u32,
    },
    FeatureDisabled {
        feature: String,
    },
}

#[derive(Debug, Clone, Default)]
pub struct UsageCounts {
    pub collections: u32,
    pub environments: u32,
}

/// Never mutates workspace — returns notices for the frontend to display.
pub fn handle_downgrade(current: &UsageCounts, new_tier: Tier) -> Vec<DowngradeNotice> {
    let limits = TierLimits::for_tier(new_tier);
    let mut notices = Vec::new();

    if let Some(max) = limits.max_collections {
        if current.collections > max {
            notices.push(DowngradeNotice::OverLimit {
                resource: "collections".into(),
                current: current.collections,
                max,
            });
        }
    }
    if let Some(max) = limits.max_environments {
        if current.environments > max {
            notices.push(DowngradeNotice::OverLimit {
                resource: "environments".into(),
                current: current.environments,
                max,
            });
        }
    }
    if !limits.mock_server_enabled {
        notices.push(DowngradeNotice::FeatureDisabled {
            feature: "mock_server".into(),
        });
    }
    if !limits.flow_visualizer_enabled {
        notices.push(DowngradeNotice::FeatureDisabled {
            feature: "flow_visualizer".into(),
        });
    }
    notices
}

#[tauri::command]
pub fn license_handle_downgrade(
    new_tier: Tier,
    current_collections: u32,
    current_environments: u32,
) -> Vec<DowngradeNotice> {
    handle_downgrade(
        &UsageCounts {
            collections: current_collections,
            environments: current_environments,
        },
        new_tier,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collections::{Node, RequestYaml, YamlPair};
    use std::fs;

    fn sample_request(name: &str) -> Node {
        Node::Request {
            name: name.into(),
            request: RequestYaml {
                name: name.into(),
                method: "GET".into(),
                url: "https://x.io".into(),
                headers: vec![],
                params: vec![],
                body_type: "none".into(),
                body: "".into(),
            },
        }
    }

    #[test]
    fn downgrade_never_deletes_existing_data() {
        // Simulate a workspace dir with 10 top-level collections (folders)
        let tmp = std::env::temp_dir().join(format!("apiforge-downgrade-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&tmp).unwrap();
        for i in 0..10 {
            let folder = Node::Folder {
                name: format!("Collection {}", i),
                children: vec![sample_request("Req")],
            };
            crate::collections::write_tree(&folder, &tmp).unwrap();
        }
        let before = crate::collections::read_tree(&tmp).unwrap();
        assert_eq!(before.len(), 10);

        // Call handle_downgrade — must not mutate FS
        let counts = UsageCounts {
            collections: before.len() as u32,
            environments: 5,
        };
        let notices = handle_downgrade(&counts, Tier::Free);
        assert!(notices.iter().any(|n| matches!(n, DowngradeNotice::OverLimit { resource, current: 10, max: 3 } if resource == "collections")));

        let after = crate::collections::read_tree(&tmp).unwrap();
        assert_eq!(after.len(), 10, "downgrade must not delete collections");
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn downgrade_over_limit_notice() {
        let counts = UsageCounts {
            collections: 5,
            environments: 1,
        };
        let notices = handle_downgrade(&counts, Tier::Free);
        assert!(notices.iter().any(|n| matches!(n, DowngradeNotice::OverLimit { resource, .. } if resource == "collections")));
    }

    #[test]
    fn downgrade_under_limit_no_notice_for_resource() {
        let counts = UsageCounts {
            collections: 2,
            environments: 1,
        };
        let notices = handle_downgrade(&counts, Tier::Free);
        // collections 2/3 is under limit, so no OverLimit for collections
        assert!(!notices.iter().any(|n| matches!(n, DowngradeNotice::OverLimit { resource, .. } if resource == "collections")));
    }
}
