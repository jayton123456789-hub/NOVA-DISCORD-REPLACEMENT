use std::ffi::c_void;

fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }
fn unhex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 || !value.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("Invalid protected value".into()); }
    (0..value.len()).step_by(2).map(|i| u8::from_str_radix(&value[i..i+2], 16).map_err(|_| "Invalid protected value".to_string())).collect()
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct DataBlob { cb_data: u32, pb_data: *mut u8 }

#[cfg(target_os = "windows")]
#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(input: *mut DataBlob, description: *const u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
    fn CryptUnprotectData(input: *mut DataBlob, description: *mut *mut u16, entropy: *mut DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "Kernel32")]
extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }

#[cfg(target_os = "windows")]
fn windows_transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    let mut input_bytes = bytes.to_vec();
    let mut input = DataBlob { cb_data: input_bytes.len() as u32, pb_data: input_bytes.as_mut_ptr() };
    let mut output = DataBlob { cb_data: 0, pb_data: std::ptr::null_mut() };
    let ok = unsafe {
        if protect {
            CryptProtectData(&mut input, std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&mut input, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if ok == 0 { return Err(format!("Windows protected storage failed: {}", std::io::Error::last_os_error())); }
    let result = unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
    unsafe { LocalFree(output.pb_data.cast::<c_void>()); }
    Ok(result)
}

pub fn protect(value: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    { return windows_transform(value.as_bytes(), true).map(|v| format!("dpapi:{}", hex(&v))); }
    #[cfg(not(target_os = "windows"))]
    { Ok(format!("dev:{}", hex(value.as_bytes()))) }
}

pub fn unprotect(value: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let raw = value.strip_prefix("dpapi:").ok_or_else(|| "Protected value is not a Windows DPAPI record".to_string())?;
        return String::from_utf8(windows_transform(&unhex(raw)?, false)?).map_err(|_| "Protected value is not UTF-8".to_string());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let raw = value.strip_prefix("dev:").ok_or_else(|| "Invalid development protected value".to_string())?;
        String::from_utf8(unhex(raw)?).map_err(|_| "Protected value is not UTF-8".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_protected_values_do_not_panic() {
        assert!(unhex("invalid").is_err());
        assert!(unhex("\u{1f600}").is_err());
        assert!(unprotect("dpapi:zz").is_err());
    }
    #[test]
    fn protected_values_round_trip() {
        let secret = "session-secret-that-must-not-be-browser-storage";
        let protected = protect(secret).unwrap();
        assert_ne!(protected, secret);
        assert_eq!(unprotect(&protected).unwrap(), secret);
    }
}
