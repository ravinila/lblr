//! Network printing over the JetDirect / RAW port.
//!
//! Practically every Ethernet or Wi-Fi label printer listens on TCP 9100 and
//! prints whatever it is handed. There is no protocol beyond "open, write,
//! close" — no acknowledgement and no status, which is why the timeouts matter:
//! a printer that is switched off accepts the connection attempt and then
//! simply never completes it.

use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use super::PrintError;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(15);

pub fn print_tcp(host: &str, port: u16, data: &[u8]) -> Result<(), PrintError> {
    let address = (host, port)
        .to_socket_addrs()
        .map_err(|source| PrintError::Network {
            host: host.to_string(),
            port,
            source,
        })?
        .next()
        .ok_or_else(|| PrintError::Network {
            host: host.to_string(),
            port,
            source: std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "host name did not resolve to an address",
            ),
        })?;

    let mut stream =
        TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).map_err(|source| {
            PrintError::Network {
                host: host.to_string(),
                port,
                source,
            }
        })?;

    stream
        .set_write_timeout(Some(WRITE_TIMEOUT))
        .map_err(|source| PrintError::Network {
            host: host.to_string(),
            port,
            source,
        })?;

    stream.write_all(data)?;
    stream.flush()?;

    // Dropping the stream closes it, which is how the printer knows the job has
    // ended. There is nothing to read back.
    Ok(())
}
