//! Generate test licenses (valid, expired, team) — matches prompt step 2
//! Private key is dev test key, never prod.

use apiforge_lib::license::{LicensePayload, LicenseTier};
use chrono::{Duration, Utc};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sk_hex = std::env::var("APIRO_LICENSE_PRIVATE_KEY")
        .unwrap_or_else(|_| "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4".into());

    // Cas 1: licence Pro perpétuelle valide
    let valid = LicensePayload {
        license_id: "lic_test_001".into(),
        tier: LicenseTier::Pro,
        seats: 1,
        issued_at: Utc::now(),
        expires_at: None,
        customer_email: None,
    };
    let valid_key = apiforge_lib::license::verify::encode_license_key(&valid, &sk_hex)?;
    println!("VALID: {}", valid_key);

    // Cas 2: licence expirée hier
    let expired = LicensePayload {
        license_id: "lic_expired_001".into(),
        tier: LicenseTier::Pro,
        seats: 1,
        issued_at: Utc::now() - Duration::days(2),
        expires_at: Some(Utc::now() - Duration::days(1)),
        customer_email: None,
    };
    let expired_key = apiforge_lib::license::verify::encode_license_key(&expired, &sk_hex)?;
    println!("EXPIRED: {}", expired_key);

    // Cas 3: licence Team 5 sièges
    let team = LicensePayload {
        license_id: "lic_team_001".into(),
        tier: LicenseTier::Team,
        seats: 5,
        issued_at: Utc::now(),
        expires_at: None,
        customer_email: Some("team@example.com".into()),
    };
    let team_key = apiforge_lib::license::verify::encode_license_key(&team, &sk_hex)?;
    println!("TEAM: {}", team_key);

    // Verify that VALID passes offline
    let decoded = apiforge_lib::license::verify_license_offline(&valid_key)?;
    println!("VERIFY VALID OK: tier={:?} seats={} id={}", decoded.tier, decoded.seats, decoded.license_id);

    // EXPIRED should fail
    match apiforge_lib::license::verify_license_offline(&expired_key) {
        Err(e) => println!("VERIFY EXPIRED correctly rejected: {}", e),
        Ok(_) => println!("VERIFY EXPIRED unexpected pass"),
    }

    Ok(())
}
