use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
fn main() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let path = std::env::args().nth(1).expect("installer path");
    let mut bytes = std::fs::read(&path).unwrap();
    let signature = std::fs::read_to_string(format!("{path}.sig")).unwrap();
    let key = String::from_utf8(STANDARD.decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap()).unwrap()).unwrap();
    let sig = String::from_utf8(STANDARD.decode(signature.trim()).unwrap()).unwrap();
    let key = PublicKey::decode(&key).unwrap();
    let sig = Signature::decode(&sig).unwrap();
    key.verify(&bytes, &sig, true).expect("installer must match baked-in key");
    bytes[0] ^= 1;
    assert!(key.verify(&bytes, &sig, true).is_err(), "tampered installer must be rejected");
    println!("Installer signature valid; tampered installer rejected.");
}
