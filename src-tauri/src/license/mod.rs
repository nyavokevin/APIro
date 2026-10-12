pub mod activate;
pub mod ai_quota;
pub mod downgrade;
pub mod fingerprint;
pub mod gate;
pub mod store;
pub mod tiers;
pub mod verify;

pub use verify::{LicenseError, LicensePayload, LicenseTier, verify_license_offline, APIRO_PUBLIC_KEY};
pub use store::{LicenseState, LicenseStatus, StoredLicense};
