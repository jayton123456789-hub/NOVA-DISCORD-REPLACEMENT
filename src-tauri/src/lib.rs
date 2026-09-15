mod updates;
mod server;
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex, time::Instant};
use sysinfo::{get_current_pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
struct HostStatus { running: bool, space_name: String, port: u16, local_ip: String, token: String, invite: String }
struct RunningServer { stop: Option<oneshot::Sender<()>>, status: HostStatus }
struct ServerController(Mutex<Option<RunningServer>>);
struct MetricsState { system: Mutex<System>, started: Instant }
#[derive(Debug, Serialize)]
struct RuntimeMetrics { nova_cpu_percent:f32,nova_memory_mb:f64,system_cpu_percent:f32,system_memory_used_gb:f64,system_memory_total_gb:f64,helper_processes:usize,uptime_seconds:u64 }

fn app_dir(app:&AppHandle)->Result<PathBuf,String>{let p=app.path().app_data_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}
fn log_line(app:&AppHandle,line:&str){if let Ok(dir)=app_dir(app){let path=dir.join("nova.log");let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();let _=std::fs::OpenOptions::new().create(true).append(true).open(path).and_then(|mut f|{use std::io::Write;writeln!(f,"[{stamp}] {line}")});}}

#[tauri::command]
async fn start_host(app:AppHandle,state:State<'_,ServerController>,space_name:String,port:u16)->Result<HostStatus,String>{
    {let guard=state.0.lock().map_err(|_|"Host lock failed".to_string())?;if let Some(r)=guard.as_ref(){return Ok(r.status.clone())}}
    let data_dir=app_dir(&app)?;let db_path=data_dir.join("nova.sqlite");let db=server::init_db(&db_path)?;let token=Uuid::new_v4().simple().to_string()[..12].to_string();let local_ip=local_ip_address::local_ip().map(|x|x.to_string()).unwrap_or_else(|_|"127.0.0.1".into());let name:String=if space_name.trim().is_empty(){"NOVA Space".to_string()}else{space_name.trim().chars().take(40).collect::<String>()};let status=HostStatus{running:true,space_name:name.clone(),port,local_ip:local_ip.clone(),token:token.clone(),invite:format!("nova://{}:{}/{}",local_ip,port,token)};let (tx,_)=tokio::sync::broadcast::channel(512);let host=std::sync::Arc::new(server::HostState{token,space_name:name,data_dir:data_dir.clone(),db:std::sync::Arc::new(Mutex::new(db)),clients:std::sync::Arc::new(Mutex::new(std::collections::HashMap::new())),tx});let addr=format!("0.0.0.0:{port}");let listener=tokio::net::TcpListener::bind(&addr).await.map_err(|e|format!("Could not host on {addr}: {e}"))?;let (stop_tx,stop_rx)=oneshot::channel::<()>();let router=server::router(host);tauri::async_runtime::spawn(async move{let _=axum::serve(listener,router).with_graceful_shutdown(async{let _=stop_rx.await;}).await;});*state.0.lock().map_err(|_|"Host lock failed".to_string())?=Some(RunningServer{stop:Some(stop_tx),status:status.clone()});log_line(&app,&format!("Hosted space on port {port}"));Ok(status)
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
pub fn run(){tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build()).manage(updates::Updates::default()).manage(ServerController(Mutex::new(None))).manage(MetricsState{system:Mutex::new(System::new_all()),started:Instant::now()}).invoke_handler(tauri::generate_handler![updates::skip_update,updates::check_update,updates::install_update,start_host,stop_host,get_host_status,get_runtime_metrics,export_diagnostics]).run(tauri::generate_context!()).expect("error while running NOVA")}
