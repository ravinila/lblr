//! Raw printing on macOS and Linux, via CUPS.
//!
//! `lp -o raw` is the CUPS equivalent of Windows' RAW datatype: it tells the
//! scheduler to skip every filter in the chain and hand the file to the backend
//! exactly as given. Shelling out to `lp` rather than linking libcups keeps the
//! dependency surface at zero and works identically on both platforms.

use std::io::Write;
use std::process::{Command, Stdio};

use super::{PrintError, PrinterInfo};

pub fn list_printers() -> Result<Vec<PrinterInfo>, PrintError> {
    let default = default_printer().unwrap_or_default();

    // `-p` lists queues with their state, one per line.
    let output = Command::new("lpstat")
        .args(["-p"])
        .output()
        .map_err(|error| PrintError::EnumerationFailed(error.to_string()))?;

    let listing = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();

    for line in listing.lines() {
        // Lines read: "printer <name> is idle.  enabled since ..."
        let Some(rest) = line.strip_prefix("printer ") else {
            continue;
        };
        let Some((name, state)) = rest.split_once(" is ") else {
            continue;
        };

        printers.push(PrinterInfo {
            is_default: !default.is_empty() && name == default,
            name: name.to_string(),
            driver: String::new(),
            port: String::new(),
            status: state.trim_end_matches('.').trim().to_string(),
        });
    }

    Ok(printers)
}

pub fn default_printer() -> Option<String> {
    let output = Command::new("lpstat").arg("-d").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    // "system default destination: <name>", or a line saying there is none.
    let (_, name) = text.split_once(": ")?;
    Some(name.trim().to_string())
}

pub fn print_raw(printer: &str, data: &[u8], job_name: &str) -> Result<(), PrintError> {
    if data.is_empty() {
        return Err(PrintError::JobFailed("nothing to print".into()));
    }

    let mut child = Command::new("lp")
        .args(["-d", printer, "-t", job_name, "-o", "raw"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| PrintError::OpenFailed(printer.to_string(), error.to_string()))?;

    child
        .stdin
        .as_mut()
        .ok_or_else(|| PrintError::JobFailed("could not write to lp".into()))?
        .write_all(data)?;

    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(PrintError::JobFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(())
}
