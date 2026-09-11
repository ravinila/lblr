import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { parseNetworkTarget, send } from '../src/destination.js'
import { printToFile } from '../src/file.js'
import { TransportError } from '../src/errors.js'
import { RAW_PORT } from '../src/tcp.js'

let scratch: string | undefined

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

async function scratchFile(name: string): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), 'lblr-'))
  return join(scratch, name)
}

describe('printToFile', () => {
  it('writes the raw bytes with no trailing newline of its own', async () => {
    const path = await scratchFile('job.prn')
    await printToFile(path, 'SIZE 50 mm,25 mm\r\n')

    expect(await readFile(path, 'utf8')).toBe('SIZE 50 mm,25 mm\r\n')
  })

  it('appends when asked, so a batch can accumulate', async () => {
    const path = await scratchFile('batch.prn')
    await printToFile(path, 'FIRST\r\n')
    await printToFile(path, 'SECOND\r\n', { append: true })

    expect(await readFile(path, 'utf8')).toBe('FIRST\r\nSECOND\r\n')
  })

  it('names the path when the write fails', async () => {
    const error = await printToFile(join(tmpdir(), 'lblr-missing-dir', 'x', 'job.prn'), 'X').catch(
      (e) => e,
    )

    expect(error).toBeInstanceOf(TransportError)
    expect(error.path).toContain('job.prn')
  })
})

describe('send', () => {
  it('routes a file destination', async () => {
    const path = await scratchFile('routed.prn')
    await send({ kind: 'file', path }, 'PRINT 1,1\r\n')

    expect(await readFile(path, 'utf8')).toBe('PRINT 1,1\r\n')
  })

  it('explains that a local queue needs the native backend', async () => {
    const error = await send({ kind: 'printer', name: 'LP 46 Neo' }, 'PRINT 1,1').catch((e) => e)

    expect(error).toBeInstanceOf(TransportError)
    expect(error.message).toContain('native backend')
  })
})

describe('parseNetworkTarget', () => {
  it('defaults a bare host to the raw port', () => {
    expect(parseNetworkTarget('192.168.1.50')).toEqual({ host: '192.168.1.50', port: RAW_PORT })
  })

  it('takes an explicit port', () => {
    expect(parseNetworkTarget('192.168.1.50:9101')).toEqual({
      host: '192.168.1.50',
      port: 9101,
    })
  })

  it('strips a tcp:// scheme', () => {
    expect(parseNetworkTarget('tcp://printer.local:9100')).toEqual({
      host: 'printer.local',
      port: 9100,
    })
  })

  it('does not mistake IPv6 colons for a port', () => {
    expect(parseNetworkTarget('fe80::1')).toEqual({ host: 'fe80::1', port: RAW_PORT })
    expect(parseNetworkTarget('::1')).toEqual({ host: '::1', port: RAW_PORT })
  })

  it('reads the bracketed IPv6 form, which is the only unambiguous one', () => {
    expect(parseNetworkTarget('[fe80::1]:9100')).toEqual({ host: 'fe80::1', port: 9100 })
    expect(parseNetworkTarget('[fe80::1]')).toEqual({ host: 'fe80::1', port: RAW_PORT })
  })

  it('ignores a nonsense port rather than splitting the host on it', () => {
    expect(parseNetworkTarget('printer.local:99999')).toEqual({
      host: 'printer.local:99999',
      port: RAW_PORT,
    })
  })
})
