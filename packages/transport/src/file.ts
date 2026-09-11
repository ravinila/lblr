/**
 * Writing a job to a file rather than a device.
 *
 * Two uses, both real. Capturing a `.prn` is the fastest way to see exactly
 * what a template compiles to when a label prints wrong. And on Windows a
 * shared printer path — `\\workstation\LP46` — can be written to directly,
 * which prints from machines that have no queue installed locally.
 */

import { writeFile } from 'node:fs/promises'

import { toBytes, type CommandEncoding } from './encode.js'
import { TransportError } from './errors.js'

export interface FileOptions {
  encoding?: CommandEncoding
  /** Append rather than replace, for accumulating a batch across calls. */
  append?: boolean
}

export async function printToFile(
  path: string,
  payload: string | Uint8Array,
  options: FileOptions = {},
): Promise<void> {
  const data = toBytes(payload, options.encoding)

  try {
    await writeFile(path, data, { flag: options.append ? 'a' : 'w' })
  } catch (cause) {
    throw new TransportError(`could not write the job to ${path}`, { path, cause })
  }
}
