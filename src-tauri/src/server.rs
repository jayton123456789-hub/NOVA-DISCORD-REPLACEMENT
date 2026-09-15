use axum::{
    body::Body,
    extract::{ws::{Message as WsMessage, WebSocket, WebSocketUpgrade}, Multipart, Path, Query, State},
    http::{header, Response, StatusCode},
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex}};
use tokio::sync::broadcast;
use tower_http::{cors::{Any, CorsLayer}, limit::RequestBodyLimitLayer};
use uuid::Uuid;

#[derive(Clone)]
pub struct HostState {
    pub token: String,
    pub space_name: String,
    pub data_dir: PathBuf,
    pub db: Arc<Mutex<Connection>>,
    pub clients: Arc<Mutex<HashMap<String, Client>>>,
    pub tx: broadcast::Sender<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Channel { pub id: String, pub name: String, pub kind: String, pub position: i64 }
#[derive(Debug, Clone, Serialize)]
pub struct Client { pub peer_id: String, pub name: String, pub status: String, pub voice_channel: Option<String> }
#[derive(Debug, Clone, Serialize)]
pub struct Attachment { pub id: String, pub name: String, pub size: u64, pub url: String }
#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage { pub id: String, pub channel_id: String, pub author_id: String, pub author: String, pub body: String, pub created_at: i64, pub attachment: Option<Attachment> }
#[derive(Debug, Clone, Serialize)]
pub struct FileMeta { pub id: String, pub name: String, pub size: u64, pub uploader: String, pub created_at: i64 }
#[derive(Debug, Deserialize)]
struct AuthQuery { token: String }
#[derive(Debug, Deserialize)]
struct WsQuery { token: String, name: String }

fn now_ms() -> i64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64 }
fn safe_name(name: &str) -> String { name.chars().map(|c| if c.is_ascii_alphanumeric() || "._- ()[]".contains(c) { c } else { '_' }).collect::<String>().chars().take(120).collect() }

pub fn init_db(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(r#"
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,author_id TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL,attachment_id TEXT,attachment_name TEXT,attachment_size INTEGER);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,uploader TEXT NOT NULL,created_at INTEGER NOT NULL,channel_id TEXT NOT NULL);
    "#).map_err(|e| e.to_string())?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM channels", [], |r| r.get(0)).unwrap_or(0);
    if count == 0 {
        let defaults = [("general","general","text",0),("gaming","gaming","text",1),("clips","clips","text",2),("lounge","Lounge","voice",10),("dev-room","Dev Room","voice",11)];
        for (id,name,kind,pos) in defaults { conn.execute("INSERT OR IGNORE INTO channels(id,name,kind,position) VALUES(?1,?2,?3,?4)", params![id,name,kind,pos]).map_err(|e|e.to_string())?; }
    }
    Ok(conn)
}

fn channels(state: &HostState) -> Vec<Channel> {
    let db=state.db.lock().unwrap(); let mut st=db.prepare("SELECT id,name,kind,position FROM channels ORDER BY position,name").unwrap();
    st.query_map([], |r|Ok(Channel{id:r.get(0)?,name:r.get(1)?,kind:r.get(2)?,position:r.get(3)?})).unwrap().filter_map(Result::ok).collect()
}
fn recent_messages(state: &HostState) -> Vec<ChatMessage> {
    let db=state.db.lock().unwrap(); let mut st=db.prepare("SELECT id,channel_id,author_id,author,body,created_at,attachment_id,attachment_name,attachment_size FROM messages ORDER BY created_at DESC LIMIT 400").unwrap();
    let mut rows:Vec<ChatMessage>=st.query_map([],|r|{let aid:Option<String>=r.get(6)?;let an:Option<String>=r.get(7)?;let size:Option<i64>=r.get(8)?;Ok(ChatMessage{id:r.get(0)?,channel_id:r.get(1)?,author_id:r.get(2)?,author:r.get(3)?,body:r.get(4)?,created_at:r.get(5)?,attachment:aid.map(|id|Attachment{id,name:an.unwrap_or_else(||"file".into()),size:size.unwrap_or(0).max(0) as u64,url:String::new()})})}).unwrap().filter_map(Result::ok).collect(); rows.reverse(); rows
}
fn members(state:&HostState)->Vec<Client>{state.clients.lock().unwrap().values().cloned().collect()}
fn broadcast_json(state:&HostState,value:Value){let _=state.tx.send(value.to_string());}
fn broadcast_presence(state:&HostState){broadcast_json(state,json!({"type":"presence","members":members(state)}));}

pub fn router(state: Arc<HostState>) -> Router {
    Router::new()
      .route("/health", get(|| async { "NOVA OK" }))
      .route("/ws", get(ws_handler))
      .route("/api/files", get(list_files).post(upload_file))
      .route("/api/files/{id}/download", get(download_file))
      .layer(RequestBodyLimitLayer::new(105 * 1024 * 1024))
      .layer(CorsLayer::new().allow_origin(Any).allow_headers(Any).allow_methods(Any))
      .with_state(state)
}

async fn ws_handler(State(state):State<Arc<HostState>>,Query(q):Query<WsQuery>,ws:WebSocketUpgrade)->impl IntoResponse{
    if q.token!=state.token{return(StatusCode::UNAUTHORIZED,"bad token").into_response()}
    ws.on_upgrade(move|socket|client_socket(socket,state,q.name)).into_response()
}

async fn client_socket(socket:WebSocket,state:Arc<HostState>,name:String){
    let peer_id=Uuid::new_v4().to_string();
    state.clients.lock().unwrap().insert(peer_id.clone(),Client{peer_id:peer_id.clone(),name:safe_name(&name),status:"online".into(),voice_channel:None});
    let (mut sender,mut receiver)=socket.split(); let mut rx=state.tx.subscribe();
    let welcome=json!({"type":"welcome","peer_id":peer_id,"space_name":state.space_name,"channels":channels(&state),"members":members(&state),"messages":recent_messages(&state)}).to_string();
    if sender.send(WsMessage::Text(welcome.into())).await.is_err(){state.clients.lock().unwrap().remove(&peer_id);return}
    broadcast_presence(&state);
    let mut send_task=tokio::spawn(async move{while let Ok(msg)=rx.recv().await{if sender.send(WsMessage::Text(msg.into())).await.is_err(){break}}});
    let st=state.clone(); let pid=peer_id.clone();
    let mut recv_task=tokio::spawn(async move{while let Some(Ok(msg))=receiver.next().await{if let WsMessage::Text(text)=msg{handle_client(&st,&pid,&text).await}}});
    tokio::select!{_=&mut send_task=>recv_task.abort(),_=&mut recv_task=>send_task.abort()}
    state.clients.lock().unwrap().remove(&peer_id); broadcast_presence(&state);
}

async fn handle_client(state:&HostState,peer_id:&str,text:&str){
    let Ok(v)=serde_json::from_str::<Value>(text) else{return}; let t=v.get("type").and_then(Value::as_str).unwrap_or("");
    match t {
      "message"=>{
        let channel=v.get("channel_id").and_then(Value::as_str).unwrap_or("").to_string(); let body=v.get("body").and_then(Value::as_str).unwrap_or("").chars().take(8000).collect::<String>();
        if channel.is_empty()||(body.trim().is_empty()&&v.get("attachment").is_none()){return}
        let author=state.clients.lock().unwrap().get(peer_id).map(|c|c.name.clone()).unwrap_or_else(||"Unknown".into()); let id=Uuid::new_v4().to_string(); let ts=now_ms();
        let att=v.get("attachment").cloned(); let (aid,aname,asize,attachment)=if let Some(a)=att{let id=a.get("id").and_then(Value::as_str).unwrap_or("").to_string();let name=a.get("name").and_then(Value::as_str).unwrap_or("file").to_string();let size=a.get("size").and_then(Value::as_u64).unwrap_or(0);(Some(id.clone()),Some(name.clone()),Some(size as i64),Some(Attachment{id,name,size,url:String::new()}))}else{(None,None,None,None)};
        if let Ok(db)=state.db.lock(){let _=db.execute("INSERT INTO messages(id,channel_id,author_id,author,body,created_at,attachment_id,attachment_name,attachment_size) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,channel,peer_id,author,body,ts,aid,aname,asize]);}
        broadcast_json(state,json!({"type":"message","message":ChatMessage{id,channel_id:channel,author_id:peer_id.into(),author,body,created_at:ts,attachment}}));
      },
      "typing"=>{let name=state.clients.lock().unwrap().get(peer_id).map(|c|c.name.clone()).unwrap_or_default();broadcast_json(state,json!({"type":"typing","channel_id":v.get("channel_id").and_then(Value::as_str).unwrap_or(""),"peer_id":peer_id,"name":name,"active":v.get("active").and_then(Value::as_bool).unwrap_or(false)}));},
      "create_channel"=>{let name=safe_name(v.get("name").and_then(Value::as_str).unwrap_or(""));let kind=v.get("kind").and_then(Value::as_str).unwrap_or("text");if name.is_empty()||!(kind=="text"||kind=="voice"){return}let id=format!("{}-{}",name.to_lowercase().replace(' ',"-"),&Uuid::new_v4().to_string()[..6]);let pos=if kind=="voice"{100}else{50};if let Ok(db)=state.db.lock(){let _=db.execute("INSERT INTO channels(id,name,kind,position) VALUES(?1,?2,?3,?4)",params![id,name,kind,pos]);}broadcast_json(state,json!({"type":"channels","channels":channels(state)}));},
      "voice_join"=>{let ch=v.get("channel_id").and_then(Value::as_str).unwrap_or("").to_string();if let Some(c)=state.clients.lock().unwrap().get_mut(peer_id){c.voice_channel=Some(ch);}broadcast_presence(state);},
      "voice_leave"=>{if let Some(c)=state.clients.lock().unwrap().get_mut(peer_id){c.voice_channel=None;}broadcast_presence(state);},
      "signal"=>{broadcast_json(state,json!({"type":"signal","target":v.get("target").and_then(Value::as_str).unwrap_or(""),"from":peer_id,"data":v.get("data").cloned().unwrap_or(Value::Null)}));},
      _=>{}
    }
}

async fn list_files(State(state):State<Arc<HostState>>,Query(q):Query<AuthQuery>)->impl IntoResponse{
    if q.token!=state.token{return(StatusCode::UNAUTHORIZED,Json(Vec::<FileMeta>::new())).into_response()}
    let db=state.db.lock().unwrap();let mut st=db.prepare("SELECT id,name,size,uploader,created_at FROM files ORDER BY created_at DESC LIMIT 200").unwrap();let rows=st.query_map([],|r|Ok(FileMeta{id:r.get(0)?,name:r.get(1)?,size:r.get::<_,i64>(2)?.max(0)as u64,uploader:r.get(3)?,created_at:r.get(4)?})).unwrap().filter_map(Result::ok).collect::<Vec<_>>();Json(rows).into_response()
}

async fn upload_file(State(state):State<Arc<HostState>>,Query(q):Query<AuthQuery>,mut multipart:Multipart)->impl IntoResponse{
    if q.token!=state.token{return(StatusCode::UNAUTHORIZED,"bad token").into_response()}
    let mut bytes=None;let mut filename="file.bin".to_string();let mut uploader="Unknown".to_string();let mut channel="general".to_string();
    while let Ok(Some(field))=multipart.next_field().await{let name=field.name().unwrap_or("").to_string();if name=="file"{filename=safe_name(field.file_name().unwrap_or("file.bin"));match field.bytes().await{Ok(b)=>bytes=Some(b),Err(_)=>return(StatusCode::BAD_REQUEST,"invalid file").into_response()}}else if name=="uploader"{if let Ok(t)=field.text().await{uploader=safe_name(&t)}}else if name=="channel_id"{if let Ok(t)=field.text().await{channel=safe_name(&t)}}}
    let Some(data)=bytes else{return(StatusCode::BAD_REQUEST,"missing file").into_response()}; if data.len()>100*1024*1024{return(StatusCode::PAYLOAD_TOO_LARGE,"100 MB max").into_response()}
    let id=Uuid::new_v4().to_string();let files_dir=state.data_dir.join("shared");if tokio::fs::create_dir_all(&files_dir).await.is_err(){return(StatusCode::INTERNAL_SERVER_ERROR,"storage error").into_response()}let path=files_dir.join(format!("{}_{}",id,filename));if tokio::fs::write(&path,&data).await.is_err(){return(StatusCode::INTERNAL_SERVER_ERROR,"write failed").into_response()}let created=now_ms();if let Ok(db)=state.db.lock(){let _=db.execute("INSERT INTO files(id,name,path,size,uploader,created_at,channel_id) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id,filename,path.to_string_lossy(),data.len() as i64,uploader,created,channel]);}
    let meta=FileMeta{id:id.clone(),name:filename,size:data.len() as u64,uploader,created_at:created};broadcast_json(&state,json!({"type":"file_added","file":meta}));Json(meta).into_response()
}

async fn download_file(State(state):State<Arc<HostState>>,Path(id):Path<String>,Query(q):Query<AuthQuery>)->impl IntoResponse{
    if q.token!=state.token{return(StatusCode::UNAUTHORIZED,"bad token").into_response()}
    let found={let db=state.db.lock().unwrap();db.query_row("SELECT name,path FROM files WHERE id=?1",params![id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).ok()};let Some((name,path))=found else{return(StatusCode::NOT_FOUND,"not found").into_response()};let Ok(data)=tokio::fs::read(path).await else{return(StatusCode::NOT_FOUND,"missing file").into_response()};Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE,"application/octet-stream").header(header::CONTENT_DISPOSITION,format!("attachment; filename=\"{}\"",name.replace('"',"_"))).body(Body::from(data)).unwrap().into_response()
}
