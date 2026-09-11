/**
 * Network printing over the JetDirect / RAW port.
 *
 * Practically every Ethernet or Wi-Fi label printer listens on TCP 9100 and
 * prints whatever it is handed. There is no protocol beyond "open, write,
 * close" — no acknowledgement and no status.
 *
 * That silence is why the timeouts matter. A printer that is switched off, or
 * one already holding a job from another workstation, leaves the connection
 * attempt hanging rather than refusing it, so without an explicit deadline a
 * print call can block until the operating system gives up minutes later.
 */

import { Socket } from 'node:net'

import { toBytes, type CommandEncoding } from './encode.js'
import { TransportError } from './errors.js'

/** The port essentially every raw-capable label printer listens on. */
export const RAW_PORT = 9100

export interface TcpOptions {
  /** Milliseconds to wait for the connection to be established. */
  connectTimeout?: number
  /** Milliseconds of inactivity tolerated once connected. */
  writeTimeout?: number
  encoding?: CommandEncoding
}

const DEFAULT_CONNECT_TIMEOUT = 5_000
const DEFAULT_WRITE_TIMEOUT = 15_000

/**
 * Send a compiled command stream to a networked printer.
 *
 * Resolves once the bytes have been flushed and the socket closed cleanly. The
 * close is significant: it is the only way the printer learns that the job has
 * ended, so a socket left open leaves the label unprinted.
 */
export function printTcp(
  host: string,
  port: number = RAW_PORT,
  payload: string | Uint8Array,
  options: TcpOptions = {},
): Promise<void> {
  const data = toBytes(payload, options.encoding)

  if (data.length === 0) {
    return Promise.reject(new TransportError('nothing to print', { host, port }))
  }

  const connectTimeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT
  const writeTimeout = options.writeTimeout ?? DEFAULT_WRITE_TIMEOUT

  return new Promise<void>((resolve, reject) => {
    const socket = new Socket()
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      error ? reject(error) : resolve()
    }

    const fail = (message: string, cause?: unknown) =>
      finish(new TransportError(message, { host, port, cause }))

    socket.setTimeout(connectTimeout)

    socket.once('timeout', () => {
      // The same event covers both phases, so the message reflects whichever
      // deadline is currently armed.
      fail(
        socket.connecting
          ? `timed out after ${connectTimeout} ms connecting to ${host}:${port}`
          : `timed out after ${writeTimeout} ms writing to ${host}:${port}`,
      )
    })

    socket.once('error', (error) => fail(`could not reach ${host}:${port}`, error))

    socket.connect(port, host, () => {
      socket.setTimeout(writeTimeout)
      socket.end(data, () => finish())
    })
  })
}
