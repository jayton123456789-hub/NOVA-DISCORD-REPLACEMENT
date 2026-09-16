mod updates;
mod server;
mod storage;
mod auth;
mod secure_store;
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex, time::Instant};
use sysinfo::{get_current_pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize)]
struct HostStatus { relay_owner: String, space_id: String, running: bool, space_name: String, port: u16, local_ip: String, token: String, invite: String }
struct RunningServer { stop: Option<oneshot::Sender<()>>, status: HostStatus }
struct ServerController(Mutex<Option<RunningServer>>);
struct MetricsState { system: Mutex<System>, started: Instant }
#[derive(Debug, Serialize)]
struct RuntimeMetrics { nova_cpu_percent:f32,nova_memory_mb:f64,system_cpu_percent:f32,system_memory_used_gb:f64,system_memory_total_gb:f64,helper_processes:usize,uptime_seconds:u64 }

fn app_dir(app:&AppHandle)->Result<PathBuf,String>{let p=app.path().app_data_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}
fn log_line(app:&AppHandle,line:&str){if let Ok(dir)=app_dir(app){let path=dir.join("nova.log");let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();let _=std::fs::OpenOptions::new().create(true).append(true).open(path).and_then(|mut f|{use std::io::Write;writeln!(f,"[{stamp}] {line}")});}}

static HOST_START: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
async fn start_host(app:AppHandle,state:State<'_,ServerController>,space_name:String,port:u16,space_id:Option<String>)->Result<HostStatus,String>{
    let _start = HOST_START.lock().await;
    {
        let guard = state.0.lock().map_err(|_| "Host lock failed")?;
        if let Some(r) = guard.as_ref() {
            if space_id.as_deref() == Some(&r.status.space_id) { return Ok(r.status.clone()); }
            return Err("This PC is already hosting a Space. Disconnect it before hosting another.".into());
        }
    }
    let root = app_dir(&app)?;
    let saved = space_id.as_ref().map(|id| storage::load_space(&root, id)).transpose()?;
    let bind_port = saved.as_ref().map(|s| s.port).unwrap_or(port);
    let addr = format!("0.0.0.0:{bind_port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| format!("Could not host on port {bind_port}: {e}"))?;
    let space = match saved { Some(s) => s, None => storage::create_space(&root, &space_name, bind_port)? };
    let data_dir = root.join("spaces").join(&space.id);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db = server::init_db(&data_dir.join("social.sqlite"))?;
    let local_ip = local_ip_address::local_ip().map(|x| x.to_string()).unwrap_or_else(|_| "127.0.0.1".into());
    let status = HostStatus { relay_owner: storage::relay_owner(&root, &space.id)?, space_id: space.id, running: true, space_name: space.name.clone(), port: space.port,
        local_ip: local_ip.clone(), token: space.token.clone(), invite: format!("nova://{}:{}/{}", local_ip, space.port, space.token) };
    let (tx, _) = tokio::sync::broadcast::channel(512);
    let host = std::sync::Arc::new(server::HostState { token: space.token, space_name: space.name, data_dir,
        db: std::sync::Arc::new(Mutex::new(db)), clients: std::sync::Arc::new(Mutex::new(std::collections::HashMap::new())), tx });
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move { let _ = axum::serve(listener, server::router(host)).with_graceful_shutdown(async { let _ = stop_rx.await; }).await; });
    *state.0.lock().map_err(|_| "Host lock failed")? = Some(RunningServer { stop: Some(stop_tx), status: status.clone() });
    log_line(&app, &format!("Hosted saved Space on port {}", status.port));
    Ok(status)
}

#[tauri::command]
fn save_workspace(app: AppHandle, account_id: String, value: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&value).map_err(|e| e.to_string())?;
    storage::save_workspace(&app_dir(&app)?, &account_id, &secure_store::protect(&value)?)
}
#[tauri::command]
fn load_workspace(app: AppHandle, account_id: String) -> Result<Option<String>, String> {
    let root = app_dir(&app)?;
    let value = storage::load_workspace(&root, &account_id)?;
    match value {
        Some(v) if v.starts_with("dpapi:") || v.starts_with("dev:") => Ok(Some(secure_store::unprotect(&v)?)),
        Some(v) => { storage::save_workspace(&root, &account_id, &secure_store::protect(&v)?)?; Ok(Some(v)) },
        None => Ok(None),
    }
}

fn secure_key(key: &str) -> Result<String, String> {
    if key.is_empty() || key.len() > 64 || !key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) { return Err("Invalid secure-storage key".into()); }
    Ok(format!("secure:{key}"))
}
#[tauri::command]
fn save_secure_secret(app: AppHandle, key: String, value: String) -> Result<(), String> {
    if value.len() > 262144 { return Err("Secure value is too large".into()); }
    storage::save_preference(&app_dir(&app)?, &secure_key(&key)?, &secure_store::protect(&value)?)
}
#[tauri::command]
fn load_secure_secret(app: AppHandle, key: String) -> Result<Option<String>, String> {
    storage::load_preference(&app_dir(&app)?, &secure_key(&key)?)?.map(|v| secure_store::unprotect(&v)).transpose()
}
#[tauri::command]
fn delete_secure_secret(app: AppHandle, key: String) -> Result<(), String> {
    storage::delete_preference(&app_dir(&app)?, &secure_key(&key)?)
}

#[tauri::command]
fn stop_host(app:AppHandle,state:State<'_,ServerController>)->Result<(),String>{if let Some(mut running)=state.0.lock().map_err(|_|"Host lock failed".to_string())?.take(){if let Some(tx)=running.stop.take(){let _=tx.send(());}log_line(&app,"Stopped host");}Ok(())}
#[tauri::command]
fn get_host_status(state:State<'_,ServerController>)->Option<HostStatus>{state.0.lock().ok().and_then(|g|g.as_ref().map(|r|r.status.clone()))}

fn is_descendant(system:&System,mut pid:sysinfo::Pid,root:sysinfo::Pid)->bool{for _ in 0..8{let Some(p)=system.process(pid)else{return false};let Some(parent)=p.parent()else{return false};if parent==root{return true}if parent==pid{return false}pid=parent;}false}
#[tauri::command]
fn get_runtime_metrics(state:State<'_,MetricsState>)->Result<RuntimeMetrics,String>{let mut s=state.system.lock().map_err(|_|"Metrics lock failed".to_string())?;s.refresh_memory();s.refresh_cpu_usage();s.refresh_processes(ProcessesToUpdate::All,true);let root=get_current_pid().map_err(|e|e.to_string())?;let divisor=s.cpus().len().max(1)as f32;let mut cpu=0.;let mut mem=0u64;let mut helpers=0usize;for(pid,p)in s.processes(){if *pid==root||is_descendant(&s,*pid,root){cpu+=p.cpu_usage()/divisor;mem=mem.saturating_add(p.memory());if *pid!=root{helpers+=1}}}Ok(RuntimeMetrics{nova_cpu_percent:cpu,nova_memory_mb:mem as f64/1024./1024.,system_cpu_percent:s.global_cpu_usage(),system_memory_used_gb:s.used_memory()as f64/1024./1024./1024.,system_memory_total_gb:s.total_memory()as f64/1024./1024./1024.,helper_processes:helpers,uptime_seconds:state.started.elapsed().as_secs()})}

#[tauri::command]
fn export_diagnostics(app:AppHandle,metrics:State<'_,MetricsState>,host:State<'_,ServerController>)->Result<String,String>{let m=get_runtime_metrics(metrics)?;let hs=host.0.lock().ok().and_then(|g|g.as_ref().map(|r|r.status.clone()));let dir=app_dir(&app)?;let path=dir.join("NOVA-Diagnostics.txt");let text=format!("NOVA v1 Diagnostics\n===================\nNOVA CPU: {:.2}%\nNOVA RAM: {:.1} MB\nHelper processes: {}\nSystem CPU: {:.1}%\nSystem RAM: {:.1}/{:.1} GB\nUptime: {} sec\nHost: {:?}\nLog: {}\n",m.nova_cpu_percent,m.nova_memory_mb,m.helper_processes,m.system_cpu_percent,m.system_memory_used_gb,m.system_memory_total_gb,m.uptime_seconds,hs.map(|h| (h.running, h.space_name, h.port)),dir.join("nova.log").display());fs::write(&path,text).map_err(|e|e.to_string())?;Ok(path.to_string_lossy().to_string())}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build()).manage(updates::Updates::default()).manage(ServerController(Mutex::new(None))).manage(MetricsState{system:Mutex::new(System::new_all()),started:Instant::now()}).invoke_handler(tauri::generate_handler![save_workspace,load_workspace,save_secure_secret,load_secure_secret,delete_secure_secret,auth::begin_google_login,updates::skip_update,updates::check_update,updates::install_update,start_host,stop_host,get_host_status,get_runtime_metrics,export_diagnostics]).run(tauri::generate_context!()).expect("error while running NOVA")}
