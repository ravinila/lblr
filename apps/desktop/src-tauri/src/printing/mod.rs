//! Raw transport to label printers.
//!
//! Everything above this module produces printer-language text — TSPL or ZPL.
//! This module's only job is to get those bytes to the device **unmodified**.
//!
//! That constraint is the whole reason lblr is a desktop app. Anything that
//! renders through a print driver resamples the page to the driver's idea of
//! resolution, and at 203 dpi that turns crisp barcode modules into grey mush.
//! A raw job bypasses rendering entirely: the printer's own firmware draws the
//! label from the commands we send.

use serde::{Deserialize, Serialize};

mod tcp;

#[cfg(windows)]
mod windows_spooler;

#[cfg(not(windows))]
mod cups;

pub use tcp::print_tcp;

#[cfg(windows)]
pub use windows_spooler::{default_printer, list_printers, print_raw};

#[cfg(not(windows))]
pub use cups::{default_printer, list_printers, print_raw};

/// A printer the system knows about.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    /// Driver name on Windows, or the CUPS queue description elsewhere.
    pub driver: String,
    /// `USB001`, `COM3`, an IP address — whatever the spooler reports.
    pub port: String,
    pub is_default: bool,
    /// Human-readable state. Empty when the platform does not report one.
    pub status: String,
}

/// Where a job should be sent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Destination {
    /// A queue installed on this machine.
    Printer { name: String },
    /// A network printer listening on the JetDirect port, almost always 9100.
    Network { host: String, port: u16 },
    /// Write the commands to a file instead of printing. Used for debugging
    /// and for feeding a printer that is not attached to this machine.
    File { path: String },
}

#[derive(Debug, thiserror::Error)]
pub enum PrintError {
    #[error("printer '{0}' could not be opened: {1}")]
    OpenFailed(String, String),

    #[error("the print job was rejected: {0}")]
    JobFailed(String),

    #[error("wrote {written} of {expected} bytes to the printer")]
    ShortWrite { written: usize, expected: usize },

    #[error("could not reach {host}:{port}: {source}")]
    Network {
        host: String,
        port: u16,
        source: std::io::Error,
    },

    #[error("could not list printers: {0}")]
    EnumerationFailed(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Send a job to whichever destination the caller chose.
pub fn send(destination: &Destination, data: &[u8], job_name: &str) -> Result<(), PrintError> {
    match destination {
        Destination::Printer { name } => print_raw(name, data, job_name),
        Destination::Network { host, port } => print_tcp(host, *port, data),
        Destination::File { path } => {
            std::fs::write(path, data)?;
            Ok(())
        }
    }
}
