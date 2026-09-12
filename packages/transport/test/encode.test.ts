import { describe, expect, it } from 'vitest'

import { EncodingError, encodeCommands, toBytes } from '../src/encode.js'

describe('encodeCommands', () => {
  it('maps ASCII one character to one byte', () => {
    expect(Array.from(encodeCommands('SIZE 50 mm,25 mm\r\n'))).toEqual(
      [...'SIZE 50 mm,25 mm\r\n'].map((c) => c.charCodeAt(0)),
    )
  })

  it('defaults to UTF-8, matching the CODEPAGE UTF-8 the compilers emit', () => {
    // Two bytes, because the printer has been told to read UTF-8.
    const bytes = encodeCommands('café')
    expect(bytes.length).toBe(5)
    expect(Array.from(bytes.slice(3))).toEqual([0xc3, 0xa9])
  })

  it('keeps latin-1 accents as single bytes when that code page is selected', () => {
    const bytes = encodeCommands('café', 'latin1')
    expect(bytes.length).toBe(4)
    expect(bytes[3]).toBe(0xe9)
  })

  it('refuses characters the selected code page cannot hold', () => {
    // A label carrying this would otherwise print as mojibake, or worse, encode
    // a barcode payload that scans as the wrong value.
    expect(() => encodeCommands('日本語', 'latin1')).toThrow(EncodingError)
  })

  it('reports which character failed and where', () => {
    try {
      encodeCommands('SKU-€100', 'latin1')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EncodingError)
      expect((error as EncodingError).character).toBe('€')
      expect((error as EncodingError).index).toBe(4)
      expect((error as EncodingError).message).toContain('U+20AC')
    }
  })

  it('holds ascii to 7 bits', () => {
    expect(() => encodeCommands('café', 'ascii')).toThrow(EncodingError)
    expect(() => encodeCommands('cafe', 'ascii')).not.toThrow()
  })

  it('encodes the whole BMP under utf8', () => {
    expect(encodeCommands('日本語', 'utf8').length).toBe(9)
  })
})

describe('toBytes', () => {
  it('passes pre-encoded bytes through untouched', () => {
    const raw = new Uint8Array([0x1b, 0x40, 0xff])
    expect(toBytes(raw)).toBe(raw)
  })
})
