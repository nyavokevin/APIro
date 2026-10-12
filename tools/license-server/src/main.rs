use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

// Re-use verify logic — duplicated minimal to avoid path dep
const APIRO_PUBLIC_KEY: &[u8] = &[
    34, 255, 252, 232, 33, 207, 255, 200, 197, 120, 224, 161, 43, 15, 244, 105, 209, 196, 150,
    47, 101, 145, 77, 66, 12, 50, 97, 199, 29, 115, 225, 76,
];
const SIG_B32_LEN: usize = 103;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LicensePayload {
    license_id: String,
    tier: String,
    seats: u32,
    issued_at: DateTime<Utc>,
    expires_at: Option<DateTime<Utc>>,
    customer_email: Option<String>,
}

fn b32_decode(s: &str) -> Option<Vec<u8>> {
    base32::decode(base32::Alphabet::RFC4648 { padding: false }, s)
}

fn verify_offline(key: &str) -> Result<LicensePayload, String> {
    let trimmed = key.trim().to_uppercase();
    let without_prefix = trimmed
        .strip_prefix("APIRO-")
        .or_else(|| trimmed.strip_prefix("APIRO "))
        .ok_or("must start with APIRO-")?;
    let cleaned: String = without_prefix.chars().filter(|c| *c != '-' && *c != ' ').collect();
    if cleaned.len() <= SIG_B32_LEN {
        return Err("too short".into());
    }
    let payload_b32 = &cleaned[..cleaned.len() - SIG_B32_LEN];
    let sig_b32 = &cleaned[cleaned.len() - SIG_B32_LEN..];
    let payload_bytes = b32_decode(payload_b32).ok_or("payload b32")?;
    let sig_bytes = b32_decode(sig_b32).ok_or("sig b32")?;
    if sig_bytes.len() != 64 {
        return Err("sig 64".into());
    }
    use ed25519_dalek::{Signature, VerifyingKey, Verifier};
    let mut arr = [0u8; 64];
    arr.copy_from_slice(&sig_bytes);
    let sig = Signature::from_bytes(&arr);
    let vk = VerifyingKey::from_bytes(APIRO_PUBLIC_KEY.try_into().unwrap()).map_err(|e| e.to_string())?;
    vk.verify(&payload_bytes, &sig).map_err(|_| "Invalid signature")?;
    let payload: LicensePayload = serde_json::from_slice(&payload_bytes).map_err(|e| e.to_string())?;
    if let Some(exp) = payload.expires_at {
        if Utc::now() > exp {
            return Err("expired".into());
        }
    }
    Ok(payload)
}

#[derive(Clone)]
struct AppState {
    // license_id -> Vec<Activation>
    activations: Arc<RwLock<HashMap<String, Vec<Activation>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Activation {
    activation_id: String,
    fingerprint: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct ActivateReq {
    license_key: String,
    device_fingerprint: String,
}

#[derive(Debug, Serialize)]
struct ActivateResp {
    activation_id: String,
    status: String,
}

async fn activate(State(state): State<AppState>, Json(req): Json<ActivateReq>) -> Result<Json<ActivateResp>, (StatusCode, String)> {
    let payload = verify_offline(&req.license_key).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let mut map = state.activations.write().await;
    let list = map.entry(payload.license_id.clone()).or_default();
    // If fingerprint already exists, return existing
    if let Some(existing) = list.iter().find(|a| a.fingerprint == req.device_fingerprint) {
        return Ok(Json(ActivateResp { activation_id: existing.activation_id.clone(), status: "activated".into() }));
    }
    if (list.len() as u32) >= payload.seats {
        let devices: Vec<String> = list.iter().map(|a| a.fingerprint.clone()).collect();
        return Err((StatusCode::CONFLICT, format!("device limit exceeded ({} seats). Active: {:?}", payload.seats, devices)));
    }
    let act = Activation { activation_id: format!("act_{}", &uuid::Uuid::new_v4().to_string()[..8]), fingerprint: req.device_fingerprint, created_at: Utc::now() };
    let id = act.activation_id.clone();
    list.push(act);
    Ok(Json(ActivateResp { activation_id: id, status: "activated".into() }))
}

#[derive(Debug, Deserialize)]
struct DeactivateReq {
    license_key: String,
    activation_id: Option<String>,
    device_fingerprint: Option<String>,
}

async fn deactivate(State(state): State<AppState>, Json(req): Json<DeactivateReq>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let payload = verify_offline(&req.license_key).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let mut map = state.activations.write().await;
    if let Some(list) = map.get_mut(&payload.license_id) {
        let before = list.len();
        if let Some(aid) = req.activation_id {
            list.retain(|a| a.activation_id != aid);
        } else if let Some(fp) = req.device_fingerprint {
            list.retain(|a| a.fingerprint != fp);
        } else {
            list.clear();
        }
        let after = list.len();
        return Ok(Json(serde_json::json!({"status":"deactivated","removed": before - after})));
    }
    Ok(Json(serde_json::json!({"status":"no activations"})))
}

#[derive(Debug, Deserialize)]
struct RevalidateReq {
    license_key: String,
    activation_id: Option<String>,
    device_fingerprint: Option<String>,
}

async fn revalidate(State(state): State<AppState>, Json(req): Json<RevalidateReq>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let payload = verify_offline(&req.license_key).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    // Check expiry
    if let Some(exp) = payload.expires_at {
        if Utc::now() > exp {
            return Ok(Json(serde_json::json!({"status":"expired"})));
        }
    }
    let map = state.activations.read().await;
    if let Some(list) = map.get(&payload.license_id) {
        let exists = if let Some(aid) = &req.activation_id {
            list.iter().any(|a| &a.activation_id == aid)
        } else if let Some(fp) = &req.device_fingerprint {
            list.iter().any(|a| &a.fingerprint == fp)
        } else {
            !list.is_empty()
        };
        if exists {
            return Ok(Json(serde_json::json!({"status":"activated"})));
        }
    }
    // If not found but payload valid, still activated (grace for server not having record — e.g., after restart)
    Ok(Json(serde_json::json!({"status":"activated"})))
}

#[derive(Debug, Deserialize)]
struct GenerateReq {
    tier: Option<String>,
    seats: Option<u32>,
    customer_email: Option<String>,
    expires_at: Option<DateTime<Utc>>,
}

async fn generate(Json(req): Json<GenerateReq>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // Admin only — check header via simple env token (skipped for demo)
    let tier = req.tier.unwrap_or_else(|| "pro".into());
    let seats = req.seats.unwrap_or(1);
    let payload = LicensePayload {
        license_id: format!("lic_{}", &uuid::Uuid::new_v4().to_string()[..8]),
        tier,
        seats,
        issued_at: Utc::now(),
        expires_at: req.expires_at,
        customer_email: req.customer_email,
    };
    let payload_bytes = serde_json::to_vec(&payload).unwrap();
    let pk_hex = std::env::var("APIRO_LICENSE_PRIVATE_KEY").unwrap_or_else(|_| "228c5c226840bd0088facf0d223b0fbfdfd5287047946743f43b1626df9d01e4".into());
    let pk_bytes = hex::decode(pk_hex.trim()).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if pk_bytes.len() != 32 {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "private key 32".into()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&pk_bytes);
    use ed25519_dalek::{SigningKey, Signer};
    let sk = SigningKey::from_bytes(&arr);
    let sig = sk.sign(&payload_bytes);
    let sig_b32 = base32::encode(base32::Alphabet::RFC4648 { padding: false }, &sig.to_bytes());
    let payload_b32 = base32::encode(base32::Alphabet::RFC4648 { padding: false }, &payload_bytes);
    let raw = format!("{}-{}", payload_b32, sig_b32);
    let grouped: String = raw.chars().collect::<Vec<_>>().chunks(4).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join("-");
    let key = format!("APIRO-{}", grouped);
    Ok(Json(serde_json::json!({"license_key": key, "payload": payload})))
}

#[tokio::main]
async fn main() {
    let state = AppState { activations: Arc::new(RwLock::new(HashMap::new())) };
    let app = Router::new()
        .route("/v1/license/activate", post(activate))
        .route("/v1/license/deactivate", post(deactivate))
        .route("/v1/license/revalidate", post(revalidate))
        .route("/v1/license/generate", post(generate))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);
    let port = std::env::var("PORT").unwrap_or_else(|_| "8787".into());
    let addr = format!("0.0.0.0:{}", port);
    println!("license-server listening on http://{} (health: /v1/license/generate)", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
