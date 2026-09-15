// Release builds are GUI applications; keep the console for development only.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nova_social_lib::run()
}
