// Isolated loopback-only integration fixture. Never uses the installed app's data.
#[path = "../src/server.rs"]
mod server;
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    let dir = std::env::temp_dir().join(format!("nova-network-smoke-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let db = server::init_db(&dir.join("test.sqlite")).unwrap();
    let (tx, _) = tokio::sync::broadcast::channel(512);
    let state = Arc::new(server::HostState { token: "11".repeat(32), space_name: "Network test".into(), data_dir: dir,
        db: Arc::new(Mutex::new(db)), clients: Arc::new(Mutex::new(std::collections::HashMap::new())), tx });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:38766").await.unwrap();
    println!("Isolated NOVA test host ready on 127.0.0.1:38766");
    axum::serve(listener, server::router(state)).await.unwrap();
}
