//! Admin CLI to generate APIro license keys
//! Usage: cargo run --bin gen-license -- --tier pro --seats 1 --email user@example.com [--expires 2027-01-01] [--private-key HEX]
//! Private key from env APIRO_LICENSE_PRIVATE_KEY or arg.

use chrono::{DateTime, Utc};
use clap::{Parser, ValueEnum};

#[derive(Parser, Debug)]
#[command(name = "gen-license", about = "Generate APIro license key")]
struct Args {
    /// Tier
    #[arg(long, value_enum, default_value = "pro")]
    tier: TierArg,

    /// Seats
    #[arg(long, default_value = "1")]
    seats: u32,

    /// Customer email (hashed or plain)
    #[arg(long)]
    email: Option<String>,

    /// Expires at (ISO 8601, e.g. 2027-01-01T00:00:00Z) or empty for perpetual
    #[arg(long)]
    expires: Option<String>,

    /// License ID (auto-generated if not provided)
    #[arg(long)]
    id: Option<String>,

    /// Private key hex (32 bytes). Falls back to env APIRO_LICENSE_PRIVATE_KEY or dev test key.
    #[arg(long)]
    private_key: Option<String>,
}

#[derive(ValueEnum, Clone, Debug)]
enum TierArg {
    Pro,
    Team,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    let private_key_hex = args
        .private_key
        .or_else(|| std::env::var("APIRO_LICENSE_PRIVATE_KEY").ok())
        .unwrap_or_else(|| {
            // Dev default (same as in verify.rs) — DO NOT USE IN PROD
            "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4".into()
        });

    let tier = match args.tier {
        TierArg::Pro => apiforge_lib::license::LicenseTier::Pro,
        TierArg::Team => apiforge_lib::license::LicenseTier::Team,
    };

    let license_id = args.id.unwrap_or_else(|| format!("lic_{}", &uuid::Uuid::new_v4().to_string()[..8]));

    let issued_at = Utc::now();
    let expires_at: Option<DateTime<Utc>> = if let Some(exp) = args.expires {
        Some(exp.parse()?)
    } else {
        None
    };

    let payload = apiforge_lib::license::LicensePayload {
        license_id,
        tier,
        seats: args.seats,
        issued_at,
        expires_at,
        customer_email: args.email,
    };

    let key = apiforge_lib::license::verify::encode_license_key(&payload, &private_key_hex)?;
    println!("{}", key);
    eprintln!("Payload: {}", serde_json::to_string_pretty(&payload)?);
    // Verify roundtrip
    let verified = apiforge_lib::license::verify_license_offline(&key)?;
    eprintln!("Verified: {:?}", verified.license_id);
    Ok(())
}
