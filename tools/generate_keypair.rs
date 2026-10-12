// tools/generate_keypair.rs — script one-shot, PAS dans l'app
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

fn main() {
    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    
    println!("PRIVATE KEY (garde secret, jamais dans le binaire):");
    println!("{}", hex::encode(signing_key.to_bytes()));
    
    println!("PUBLIC KEY (à coller dans APIRO_PUBLIC_KEY):");
    println!("{}", hex::encode(signing_key.verifying_key().to_bytes()));
}