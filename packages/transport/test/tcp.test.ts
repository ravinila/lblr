import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { printTcp } from '../src/tcp.js'
import { TransportError } from '../src/errors.js'

/** A stand-in printer: accepts a connection and remembers what it was sent. */
function fakePrinter(): Promise<{ server: Server; port: number; received: Promise<Buffer> }> {
  return new Promise((resolve) => {
    let resolveReceived: (value: Buffer) => void
    const received = new Promise<Buffer>((r) => (resolveReceived = r))

    const server = createServer((socket) => {
      const chunks: Buffer[] = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => resolveReceived(Buffer.concat(chunks)))
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ server, port, received })
    })
  })
}

let open: Server | undefined

afterEach(() => {
  open?.close()
  open = undefined
})

describe('printTcp', () => {
  it('delivers the command stream and closes the socket', async () => {
    const { server, port, received } = await fakePrinter()
    open = server

    await printTcp('127.0.0.1', port, 'SIZE 50 mm,25 mm\r\nPRINT 1,1\r\n')

    // The end-of-job signal is the close, so `received` only settles if we
    // actually closed rather than leaving the socket hanging.
    expect((await received).toString('latin1')).toBe('SIZE 50 mm,25 mm\r\nPRINT 1,1\r\n')
  })

  it('sends UTF-8 by default, which is what the compilers select on the printer', async () => {
    const { server, port, received } = await fakePrinter()
    open = server

    await printTcp('127.0.0.1', port, 'TEXT "café"')

    expect((await received).toString('utf8')).toBe('TEXT "café"')
  })

  it('honours an explicit legacy code page', async () => {
    const { server, port, received } = await fakePrinter()
    open = server

    await printTcp('127.0.0.1', port, 'TEXT "café"', { encoding: 'latin1' })

    const bytes = await received
    expect(bytes.length).toBe('TEXT "café"'.length)
    expect(bytes[bytes.length - 2]).toBe(0xe9)
  })

  it('accepts pre-encoded bytes', async () => {
    const { server, port, received } = await fakePrinter()
    open = server

    await printTcp('127.0.0.1', port, new Uint8Array([0x7e, 0x21, 0x54]))

    expect(Array.from(await received)).toEqual([0x7e, 0x21, 0x54])
  })

  it('refuses an empty job instead of opening a pointless connection', async () => {
    await expect(printTcp('127.0.0.1', 9100, '')).rejects.toThrow(TransportError)
  })

  it('reports the host and port when the printer is unreachable', async () => {
    // Port 1 on loopback has nothing listening, so this refuses immediately.
    const error = await printTcp('127.0.0.1', 1, 'PRINT 1,1').catch((e) => e)

    expect(error).toBeInstanceOf(TransportError)
    expect(error.host).toBe('127.0.0.1')
    expect(error.port).toBe(1)
    expect(error.cause).toBeDefined()
  })

  it('completes once the bytes are flushed, since the protocol has no acknowledgement', async () => {
    // A printer that accepts the connection and never reads still leaves a
    // small job looking successful: there is nothing to acknowledge, and the
    // bytes sit in the socket buffer. Worth pinning, because it sets the limit
    // on what a caller can infer from `printTcp` resolving.
    const server = createServer(() => {
      /* accepts, then deliberately silent */
    })
    open = server
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    await expect(printTcp('127.0.0.1', port, 'PRINT 1,1')).resolves.toBeUndefined()
  })

  it('gives up on an address that never answers the handshake', async () => {
    // 192.0.2.0/24 is TEST-NET-1 (RFC 5737) and is guaranteed not to be routed,
    // which is how a powered-off printer behaves. Some networks answer with an
    // ICMP unreachable instead of dropping the packet, so either the connect
    // timeout or a socket error is correct here — both surface the same way.
    const error = await printTcp('192.0.2.1', 9100, 'PRINT 1,1', {
      connectTimeout: 150,
    }).catch((e) => e)

    expect(error).toBeInstanceOf(TransportError)
    expect(error.host).toBe('192.0.2.1')
  }, 10_000)
})
