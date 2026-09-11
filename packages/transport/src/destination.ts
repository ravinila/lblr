/**
 * One way to name where a job should go.
 *
 * This mirrors the `Destination` enum the Tauri backend deserialises, so the
 * same object can be handed to `send()` in a Node service or passed straight
 * through the desktop app's IPC boundary without translation.
 */

import { printTcp, RAW_PORT, type TcpOptions } from './tcp.js'
import { printToFile, type FileOptions } from './file.js'
import { TransportError } from './errors.js'
import type { CommandEncoding } from './encode.js'

export type Destination =
  /** A network printer on the JetDirect port. */
  | { kind: 'network'; host: string; port?: number }
  /** Write the commands out instead of printing them. */
  | { kind: 'file'; path: string }
  /**
   * A queue installed on this machine. Node cannot reach the Windows spooler
   * or CUPS on its own, so this is resolved by the desktop app's Rust backend;
   * `send()` rejects it rather than pretending otherwise.
   */
  | { kind: 'printer'; name: string }

export interface SendOptions extends TcpOptions, FileOptions {
  encoding?: CommandEncoding
}

export async function send(
  destination: Destination,
  payload: string | Uint8Array,
  options: SendOptions = {},
): Promise<void> {
  switch (destination.kind) {
    case 'network':
      return printTcp(destination.host, destination.port ?? RAW_PORT, payload, options)

    case 'file':
      return printToFile(destination.path, payload, options)

    case 'printer':
      throw new TransportError(
        `printing to the local queue '${destination.name}' needs the desktop app's ` +
          'native backend; use a network or file destination from Node',
      )
  }
}

/**
 * Parse the spellings people actually type: `host`, `host:port`,
 * `tcp://host:port`, and the bracketed `[::1]:9100` form for IPv6.
 */
export function parseNetworkTarget(target: string): { host: string; port: number } {
  const withoutScheme = target.replace(/^tcp:\/\//i, '').trim()

  const asPort = (value: string): number | undefined => {
    const port = Number(value)
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
  }

  // `[::1]` and `[::1]:9100` — the only unambiguous way to write IPv6 with a port.
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(withoutScheme)
  if (bracketed) {
    const host = bracketed[1] ?? ''
    const port = bracketed[2] === undefined ? undefined : asPort(bracketed[2])
    return { host, port: port ?? RAW_PORT }
  }

  // A bare IPv6 literal is full of colons, so a trailing `:n` is only a port
  // when there is exactly one colon in the whole string.
  const firstColon = withoutScheme.indexOf(':')
  if (firstColon > 0 && firstColon === withoutScheme.lastIndexOf(':')) {
    const port = asPort(withoutScheme.slice(firstColon + 1))
    if (port !== undefined) {
      return { host: withoutScheme.slice(0, firstColon), port }
    }
  }

  return { host: withoutScheme, port: RAW_PORT }
}
