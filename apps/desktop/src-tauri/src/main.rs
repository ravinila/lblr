// Keep the console window hidden in release builds; it is useful in debug.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lblr_lib::run()
}
