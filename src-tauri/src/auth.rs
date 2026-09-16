use serde::Serialize;
use std::{process::Command, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

#[derive(Serialize)]
pub struct BrowserLoginResult { ticket: String }

fn service_origin(value: &str) -> Result<String, String> {
    let value = value.trim().trim_end_matches('/');
    if value.contains('?') || value.contains('#') || value.contains(' ') { return Err("Invalid NOVA service endpoint".into()); }
    let (scheme, rest) = value.split_once("://").ok_or_else(|| "Invalid NOVA service endpoint".to_string())?;
    if rest.is_empty() || rest.contains('/') || rest.contains('@') { return Err("Invalid NOVA service endpoint".into()); }
    let host = rest.split(':').next().unwrap_or("");
    if scheme != "https" && !(scheme == "http" && (host == "127.0.0.1" || host == "localhost")) { return Err("NOVA online services require HTTPS".into()); }
    Ok(value.to_string())
}

fn pct(value: &str) -> String {
    value.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = { let mut c = Command::new("rundll32.exe"); c.arg("url.dll,FileProtocolHandler").arg(url); c };
    #[cfg(target_os = "macos")]
    let mut command = { let mut c = Command::new("open"); c.arg(url); c };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = { let mut c = Command::new("xdg-open"); c.arg(url); c };
    #[cfg(target_os = "windows")]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    command.spawn().map_err(|e| format!("Could not open your browser: {e}"))?;
    Ok(())
}

fn query_value<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|part| { let (k,v) = part.split_once('=')?; if k == key { Some(v) } else { None } })
}

#[tauri::command]
pub async fn begin_google_login(service_url: String, challenge: String) -> Result<BrowserLoginResult, String> {
    if challenge.len() != 64 || !challenge.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("Invalid sign-in challenge".into()); }
    let service = service_origin(&service_url)?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| format!("Could not start the sign-in callback: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let app_state = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let callback = format!("http://127.0.0.1:{port}/callback");
    let start = format!("{service}/v1/auth/google/start?return={}&app_state={}&challenge={}", pct(&callback), app_state, challenge.to_ascii_lowercase());
    open_browser(&start)?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(180);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() { return Err("Google sign-in timed out. Try again.".into()); }
        let accepted = tokio::time::timeout(remaining, listener.accept()).await.map_err(|_| "Google sign-in timed out. Try again.".to_string())?;
        let (mut stream, _) = accepted.map_err(|e| format!("Sign-in callback failed: {e}"))?;
        let mut buffer = vec![0u8; 8192];
        let timeout = deadline.saturating_duration_since(tokio::time::Instant::now()).min(Duration::from_secs(3));
        let mut read = 0;
        let complete = tokio::time::timeout(timeout, async {
            while read < buffer.len() {
                let count = stream.read(&mut buffer[read..]).await?;
                if count == 0 { break; }
                read += count;
                if buffer[..read].windows(4).any(|w| w == b"\r\n\r\n") { return Ok::<bool,std::io::Error>(true); }
            }
            Ok(false)
        }).await;
        if !matches!(complete, Ok(Ok(true))) { continue; }
        let request = String::from_utf8_lossy(&buffer[..read]);
        let path = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("");
        let (route, query) = path.split_once('?').unwrap_or((path, ""));
        if route != "/callback" {
            let body = "Not found";
            let response = format!("HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }
        let returned_state = query_value(query, "app_state").unwrap_or("");
        if returned_state != app_state {
            let body = "Invalid NOVA sign-in state";
            let response = format!("HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }
        let ticket = query_value(query, "ticket").unwrap_or("");
        let error = query_value(query, "error");
        let success = ticket.len() == 64 && ticket.chars().all(|c| c.is_ascii_hexdigit());
        let body = if success { "<html><body style='font-family:Segoe UI;background:#080a0e;color:#e8edf4;padding:40px'><h2>Signed in to NOVA</h2><p>You can close this tab and return to NOVA.</p></body></html>" } else { "<html><body style='font-family:Segoe UI;background:#080a0e;color:#e8edf4;padding:40px'><h2>NOVA sign-in was not completed</h2><p>Return to NOVA and try again.</p></body></html>" };
        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
        let _ = stream.write_all(response.as_bytes()).await;
        if let Some(code) = error { return Err(format!("Google sign-in failed: {code}")); }
        if !success { return Err("Google sign-in did not return a valid NOVA ticket.".into()); }
        return Ok(BrowserLoginResult { ticket: ticket.to_ascii_lowercase() });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_secure_or_loopback_services_are_allowed() {
        assert!(service_origin("https://nova.example.com").is_ok());
        assert!(service_origin("http://127.0.0.1:8787").is_ok());
        assert!(service_origin("http://localhost:8787").is_ok());
        assert!(service_origin("http://nova.example.com").is_err());
        assert!(service_origin("https://user@nova.example.com").is_err());
    }
}
