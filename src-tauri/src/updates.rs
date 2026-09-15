use std::{time::Duration, sync::Mutex as StdMutex};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex, Notify};

#[derive(Default)]
pub struct Updates {
    pending: Mutex<Option<Update>>,
    phase: StdMutex<(bool, bool)>,
    cancel: Notify,
}

#[tauri::command]
pub fn skip_update(state: State<'_, Updates>) -> Result<(), String> {
    let mut phase = state.phase.lock().map_err(|_| "Update lock failed")?;
    if phase.1 { return Err("Installation already started".into()); }
    phase.0 = true;
    state.cancel.notify_one();
    Ok(())
}

#[tauri::command]
pub async fn check_update(app: AppHandle, state: State<'_, Updates>) -> Result<Option<String>, String> {
    let mut pending = state.pending.lock().await;
    let update = app.updater_builder().timeout(Duration::from_secs(8)).build()
        .map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|u| u.version.clone());
    *pending = update;
    Ok(version)
}

#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, Updates>, host: State<'_, crate::ServerController>) -> Result<(), String> {
    if state.phase.lock().map_err(|_| "Update lock failed")?.0 { return Err("Update deferred".into()); }
    if host.0.lock().map_err(|_| "Host lock failed")?.is_some() {
        return Err("Stop hosting before installing an update so your friends are not disconnected.".into());
    }
    let mut pending = state.pending.lock().await;
    let update = pending.as_mut().ok_or("Check for updates first")?;
    update.timeout = Some(Duration::from_secs(120));
    let mut downloaded = 0u64;
    let bytes = tokio::select! {
        result = update.download(|chunk, total| {
            downloaded += chunk as u64;
            let _ = app.emit("nova-update-progress", serde_json::json!({"downloaded": downloaded, "total": total}));
        }, || {}) => result.map_err(|e| e.to_string())?,
        _ = state.cancel.notified() => return Err("Update deferred".into()),
    };
    {
        let mut phase = state.phase.lock().map_err(|_| "Update lock failed")?;
        if phase.0 { return Err("Update deferred".into()); }
        phase.1 = true;
    }
    let _ = app.emit("nova-update-installing", ());
    if let Err(e) = update.install(bytes) {
        state.phase.lock().map_err(|_| "Update lock failed")?.1 = false;
        return Err(e.to_string());
    }
    *pending = None;
    app.restart();
}
