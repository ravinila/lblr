//! Windows raw printing through the spooler.
//!
//! The sequence is `OpenPrinter` → `StartDocPrinter` with datatype `"RAW"` →
//! `WritePrinter` → `EndDocPrinter`. Declaring the datatype as RAW is the part
//! that matters: it tells the spooler to hand the bytes to the device untouched
//! instead of passing them to the driver's rendering pipeline.
//!
//! This means the installed driver's paper size, scaling and dithering settings
//! are all bypassed, which is exactly what we want — the printer's firmware
//! interprets our TSPL or ZPL directly.

use std::ffi::c_void;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW,
    StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS,
    PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
};

use super::{PrintError, PrinterInfo};

/// Closes the printer handle however we leave the function.
struct PrinterHandle(HANDLE);

impl Drop for PrinterHandle {
    fn drop(&mut self) {
        // Nothing useful can be done if this fails while unwinding.
        unsafe {
            let _ = ClosePrinter(self.0);
        }
    }
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Read a null-terminated wide string that Windows allocated for us.
unsafe fn from_wide(pointer: PWSTR) -> String {
    if pointer.is_null() {
        return String::new();
    }
    pointer.to_string().unwrap_or_default()
}

pub fn list_printers() -> Result<Vec<PrinterInfo>, PrintError> {
    let default = default_printer().unwrap_or_default();
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;

    unsafe {
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;

        // The first call is expected to fail: it exists only to report how large
        // a buffer the second call needs.
        let _ = EnumPrintersW(flags, PCWSTR::null(), 2, None, &mut needed, &mut returned);
        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut buffer = vec![0u8; needed as usize];
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            Some(&mut buffer),
            &mut needed,
            &mut returned,
        )
        .map_err(|error| PrintError::EnumerationFailed(error.to_string()))?;

        let entries = std::slice::from_raw_parts(
            buffer.as_ptr() as *const PRINTER_INFO_2W,
            returned as usize,
        );

        Ok(entries
            .iter()
            .map(|entry| {
                let name = from_wide(entry.pPrinterName);
                PrinterInfo {
                    is_default: !default.is_empty() && name == default,
                    driver: from_wide(entry.pDriverName),
                    port: from_wide(entry.pPortName),
                    status: describe_status(entry.Status),
                    name,
                }
            })
            .collect())
    }
}

pub fn default_printer() -> Option<String> {
    unsafe {
        let mut length: u32 = 0;
        // As with EnumPrinters, the first call only sizes the buffer.
        let _ = GetDefaultPrinterW(PWSTR::null(), &mut length);
        if length == 0 {
            return None;
        }

        let mut buffer = vec![0u16; length as usize];
        if !GetDefaultPrinterW(PWSTR(buffer.as_mut_ptr()), &mut length).as_bool() {
            return None;
        }

        let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        Some(String::from_utf16_lossy(&buffer[..end]))
    }
}

pub fn print_raw(printer: &str, data: &[u8], job_name: &str) -> Result<(), PrintError> {
    if data.is_empty() {
        return Err(PrintError::JobFailed("nothing to print".into()));
    }

    let printer_name = to_wide(printer);
    let doc_name = to_wide(job_name);
    let mut datatype = to_wide("RAW");

    unsafe {
        let mut raw_handle = HANDLE::default();
        OpenPrinterW(PCWSTR(printer_name.as_ptr()), &mut raw_handle, None)
            .map_err(|error| PrintError::OpenFailed(printer.to_string(), error.to_string()))?;
        let handle = PrinterHandle(raw_handle);

        let mut document_name = doc_name;
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(document_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            // Without this the spooler would render the job through the driver.
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };

        let job_id = StartDocPrinterW(handle.0, 1, &doc_info);
        if job_id == 0 {
            return Err(PrintError::JobFailed(format!(
                "StartDocPrinter failed: {}",
                windows::core::Error::from_win32()
            )));
        }

        StartPagePrinter(handle.0)
            .ok()
            .map_err(|error| PrintError::JobFailed(error.to_string()))?;

        let mut written: u32 = 0;
        WritePrinter(
            handle.0,
            data.as_ptr() as *const c_void,
            data.len() as u32,
            &mut written,
        )
        .ok()
        .map_err(|error| PrintError::JobFailed(error.to_string()))?;

        let _ = EndPagePrinter(handle.0);
        let _ = EndDocPrinter(handle.0);

        if written as usize != data.len() {
            return Err(PrintError::ShortWrite {
                written: written as usize,
                expected: data.len(),
            });
        }
    }

    Ok(())
}

/// Translate the spooler's status bitmask into something worth showing a user.
/// Only the states an operator can act on are reported; the rest read as ready.
fn describe_status(status: u32) -> String {
    const PRINTER_STATUS_PAUSED: u32 = 0x0000_0001;
    const PRINTER_STATUS_ERROR: u32 = 0x0000_0002;
    const PRINTER_STATUS_PAPER_JAM: u32 = 0x0000_0008;
    const PRINTER_STATUS_PAPER_OUT: u32 = 0x0000_0010;
    const PRINTER_STATUS_OFFLINE: u32 = 0x0000_0080;
    const PRINTER_STATUS_DOOR_OPEN: u32 = 0x0040_0000;
    const PRINTER_STATUS_NOT_AVAILABLE: u32 = 0x0000_1000;

    let mut states = Vec::new();
    if status & PRINTER_STATUS_PAUSED != 0 {
        states.push("paused");
    }
    if status & PRINTER_STATUS_ERROR != 0 {
        states.push("error");
    }
    if status & PRINTER_STATUS_PAPER_JAM != 0 {
        states.push("paper jam");
    }
    if status & PRINTER_STATUS_PAPER_OUT != 0 {
        states.push("out of media");
    }
    if status & PRINTER_STATUS_DOOR_OPEN != 0 {
        states.push("cover open");
    }
    if status & (PRINTER_STATUS_OFFLINE | PRINTER_STATUS_NOT_AVAILABLE) != 0 {
        states.push("offline");
    }

    if states.is_empty() {
        "ready".to_string()
    } else {
        states.join(", ")
    }
}
