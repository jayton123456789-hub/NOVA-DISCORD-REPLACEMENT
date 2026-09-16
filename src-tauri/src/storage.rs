use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct Space {
    pub id: String,
    pub name: String,
    pub token: String,
    pub port: u16,
}

fn open(root: &Path) -> Result<Connection, String> {
    let db = Connection::open(root.join("workspace-v2.sqlite")).map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS hosted_spaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL, port INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;
    Ok(db)
}

pub fn create_space(root: &Path, name: &str, port: u16) -> Result<Space, String> {
    if name.trim().is_empty() || port == 0 { return Err("Enter a Space name and valid port.".into()); }
    let space = Space { id: Uuid::new_v4().to_string(), name: name.trim().chars().take(40).collect(), token: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()), port };
    let protected_token = crate::secure_store::protect(&space.token)?;
    open(root)?.execute("INSERT INTO hosted_spaces VALUES(?1,?2,?3,?4)", params![space.id, space.name, protected_token, space.port]).map_err(|e| e.to_string())?;
    Ok(space)
}

pub fn load_space(root: &Path, id: &str) -> Result<Space, String> {
    Uuid::parse_str(id).map_err(|_| "Invalid saved Space ID".to_string())?;
    let db = open(root)?;
    let mut space = db.query_row("SELECT id,name,token,port FROM hosted_spaces WHERE id=?1", [id], |r| {
        Ok(Space { id: r.get(0)?, name: r.get(1)?, token: r.get(2)?, port: r.get(3)? })
    }).map_err(|e| format!("Could not restore the saved Space: {e}"))?;
    if space.token.starts_with("dpapi:") || space.token.starts_with("dev:") {
        space.token = crate::secure_store::unprotect(&space.token)?;
    } else {
        let legacy = space.token.clone();
        db.execute("UPDATE hosted_spaces SET token=?1 WHERE id=?2", params![crate::secure_store::protect(&legacy)?, id]).map_err(|e| e.to_string())?;
    }
    Ok(space)
}

fn workspace_key(account_id: &str) -> Result<String, String> {
    if account_id.is_empty() || account_id.len() > 80 || !account_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') { return Err("Invalid NOVA account ID".into()); }
    Ok(format!("workspace:{account_id}"))
}

pub fn save_workspace(root: &Path, account_id: &str, value: &str) -> Result<(), String> {
    if value.len() > 262144 { return Err("Workspace settings are too large".into()); }
    let key = workspace_key(account_id)?;
    open(root)?.execute("INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_workspace(root: &Path, account_id: &str) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;
    let key = workspace_key(account_id)?;
    let db = open(root)?;
    if let Some(value) = db.query_row("SELECT value FROM preferences WHERE key=?1", [&key], |r| r.get(0)).optional().map_err(|e| e.to_string())? { return Ok(Some(value)); }
    // Migrate the pre-account workspace once, binding it to the first NOVA account used on this Windows profile.
    let legacy: Option<String> = db.query_row("SELECT value FROM preferences WHERE key='workspace'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if let Some(value) = legacy {
        db.execute("INSERT INTO preferences(key,value) VALUES(?1,?2)", params![key,value]).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM preferences WHERE key='workspace'", []).map_err(|e| e.to_string())?;
        return Ok(Some(value));
    }
    Ok(None)
}

pub fn save_preference(root: &Path, key: &str, value: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > 96 || value.len() > 1024 * 1024 { return Err("Preference is invalid".into()); }
    open(root)?.execute("INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_preference(root: &Path, key: &str) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;
    open(root)?.query_row("SELECT value FROM preferences WHERE key=?1", [key], |r| r.get(0)).optional().map_err(|e| e.to_string())
}

pub fn delete_preference(root: &Path, key: &str) -> Result<(), String> {
    open(root)?.execute("DELETE FROM preferences WHERE key=?1", [key]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn relay_owner(root: &Path, space_id: &str) -> Result<String,String> {
    use rusqlite::OptionalExtension;
    let db = open(root)?;
    let key = format!("relay-owner:{space_id}");
    if let Some(value) = db.query_row("SELECT value FROM preferences WHERE key=?1", [&key], |r| r.get::<_,String>(0)).optional().map_err(|e| e.to_string())? {
        if value.starts_with("dpapi:") || value.starts_with("dev:") { return crate::secure_store::unprotect(&value); }
        db.execute("UPDATE preferences SET value=?1 WHERE key=?2", params![crate::secure_store::protect(&value)?, key]).map_err(|e| e.to_string())?;
        return Ok(value);
    }
    let value = format!("{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple());
    db.execute("INSERT INTO preferences(key,value) VALUES(?1,?2)",params![key,crate::secure_store::protect(&value)?]).map_err(|e| e.to_string())?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn spaces_and_settings_survive_reopen_without_seeding_channels() {
        let root = std::env::temp_dir().join(format!("nova-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let a = create_space(&root, "Friends", 38765).unwrap();
        let b = create_space(&root, "Projects", 38766).unwrap();
        let restored = load_space(&root, &a.id).unwrap();
        assert_eq!(restored.token, a.token);
        assert_ne!(a.id, b.id);
        assert_ne!(a.token, b.token);
        let stored_token: String = open(&root).unwrap().query_row("SELECT token FROM hosted_spaces WHERE id=?1", [&a.id], |r| r.get(0)).unwrap();
        assert_ne!(stored_token, a.token);
        let owner = relay_owner(&root, &a.id).unwrap();
        let stored_owner: String = open(&root).unwrap().query_row("SELECT value FROM preferences WHERE key=?1", [format!("relay-owner:{}", a.id)], |r| r.get(0)).unwrap();
        assert_ne!(stored_owner, owner);
        save_workspace(&root, "11111111-1111-1111-1111-111111111111", "{\"username\":\"Jayton\"}").unwrap();
        assert_eq!(load_workspace(&root, "11111111-1111-1111-1111-111111111111").unwrap().unwrap(), "{\"username\":\"Jayton\"}");
        let db = crate::server::init_db(&root.join("empty.sqlite")).unwrap();
        assert_eq!(db.query_row("SELECT COUNT(*) FROM channels", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        assert!(load_space(&root, "../elsewhere").is_err());
        drop(db);
        std::fs::remove_dir_all(root).unwrap();
    }
}
