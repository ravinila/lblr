//! lblr desktop backend.
//!
//! The frontend owns the label model and both compilers — those are plain
//! TypeScript packages that run anywhere. This crate exists for the one thing a
//! web page cannot do: hand raw bytes to a printer.

mod printing;

use printing::{Destination, PrinterInfo};

/// Printers the operating system knows about, ready to populate a picker.
#[tauri::command]
fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    printing::list_printers().map_err(|error| error.to_string())
}

#[tauri::command]
fn default_printer() -> Option<String> {
    printing::default_printer()
}

/// Send a compiled command stream to a destination.
///
/// `commands` arrives as a string because TSPL and ZPL are both text protocols.
/// It is encoded as UTF-8, which matches the `CODEPAGE UTF-8` and `^CI28` that
/// the compilers emit — any other encoding here would silently mangle non-ASCII
/// label text.
#[tauri::command]
fn print_job(destination: Destination, commands: String, job_name: String) -> Result<(), String> {
    let name = if job_name.is_empty() {
        "lblr label".to_string()
    } else {
        job_name
    };

    printing::send(&destination, commands.as_bytes(), &name).map_err(|error| error.to_string())
}

/// Check that a network printer is listening before sending a run to it.
#[tauri::command]
fn probe_network_printer(host: String, port: u16) -> Result<bool, String> {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    let address = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .next()
        .ok_or_else(|| "host name did not resolve".to_string())?;

    Ok(TcpStream::connect_timeout(&address, Duration::from_secs(3)).is_ok())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            list_printers,
            default_printer,
            print_job,
            probe_network_printer
        ])
        .run(tauri::generate_context!())
        .expect("error while running lblr");
}
