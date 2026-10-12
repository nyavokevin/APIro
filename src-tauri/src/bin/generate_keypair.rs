use ed25519_dalek::SigningKey;

fn main() {
    let mut sk_raw = [0u8; 32];
    getrandom::getrandom(&mut sk_raw).expect("getrandom failed");
    let signing_key = SigningKey::from_bytes(&sk_raw);
    let verifying_key = signing_key.verifying_key();
    let sk_bytes = signing_key.to_bytes();
    let pk_bytes = verifying_key.to_bytes();
    println!("PRIVATE_KEY (hex 64 chars): {}", hex::encode(sk_bytes));
    println!("PRIVATE_KEY (base32): {}", base32::encode(base32::Alphabet::RFC4648 { padding: false }, &sk_bytes));
    println!("PUBLIC_KEY (hex 64 chars): {}", hex::encode(pk_bytes));
    println!("PUBLIC_KEY (bytes array): {:?}", pk_bytes);
    println!("PUBLIC_KEY (base32): {}", base32::encode(base32::Alphabet::RFC4648 { padding: false }, &pk_bytes));
    // Also output Rust const
    print!("const APIRO_PUBLIC_KEY: &[u8] = &[");
    for (i, b) in pk_bytes.iter().enumerate() {
        if i > 0 { print!(", "); }
        print!("{}", b);
    }
    println!("];");
}
