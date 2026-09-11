import { describe, expect, it } from 'vitest'
import { barcode, createTemplate, qrcode, text } from '@lblr/core'
import { compile, compileBatch, hexEscape } from '@lblr/zpl'

const partTag = () =>
  createTemplate({
    name: 'part-tag',
    width: 50,
    height: 25,
    gap: 2,
    elements: [
      text({ x: 3, y: 3, value: '{{name}}', fontSize: 3.5 }),
      barcode({ x: 3, y: 10, value: '{{sku}}', symbology: 'code128', height: 10 }),
    ],
  })

describe('ZPL label envelope', () => {
  it('wraps the label and sets its geometry in dots', () => {
    const out = compile(partTag(), { name: 'ACME', sku: '7894561230' }, { dpi: 203 })
    expect(out).toContain('^XA')
    expect(out).toContain('^XZ')
    expect(out).toContain('^PW400')
    expect(out).toContain('^LL200')
    expect(out).toContain('^MNY')
    expect(out).toContain('^CI28')
  })

  it('maps the model darkness scale onto ZPL\'s', () => {
    // The model uses TSPL's 0-15; ZPL runs 0-30, so 8 becomes 16.
    const out = compile(partTag(), {}, { dpi: 203 })
    expect(out).toContain('~SD16')
    expect(out).toContain('^PR4')
  })

  it('selects media tracking from the stock type', () => {
    const mark = createTemplate({ name: 'm', width: 50, height: 25, mediaType: 'blackmark' })
    expect(compile(mark, {}, { dpi: 203 })).toContain('^MNM')

    const continuous = createTemplate({
      name: 'c',
      width: 50,
      height: 25,
      mediaType: 'continuous',
    })
    expect(compile(continuous, {}, { dpi: 203 })).toContain('^MNN')
  })
})

describe('ZPL element output', () => {
  it('positions text and sizes the scalable font in dots', () => {
    const out = compile(partTag(), { name: 'ACME', sku: '123' }, { dpi: 203 })
    expect(out).toContain('^FO24,24')
    expect(out).toContain('^A0N,28,28')
    expect(out).toContain('^FDACME^FS')
  })

  it('double-strikes bold text', () => {
    const template = createTemplate({
      name: 'bold',
      width: 50,
      height: 25,
      elements: [text({ x: 3, y: 3, value: 'HEAVY', fontSize: 3, bold: true })],
    })
    const out = compile(template, {}, { dpi: 203 })
    expect(out).toContain('^FO24,24')
    expect(out).toContain('^FO25,24')
  })

  it('emits a field block for wrapping text', () => {
    const template = createTemplate({
      name: 'wrapped',
      width: 50,
      height: 25,
      elements: [
        text({ x: 2, y: 2, value: 'wraps across lines', fontSize: 3, maxWidth: 40, align: 'center' }),
      ],
    })
    expect(compile(template, {}, { dpi: 203 })).toMatch(/\^FB320,\d+,0,C,0/)
  })

  it('writes barcode defaults then the symbology command', () => {
    const out = compile(partTag(), { name: 'X', sku: '7894561230' }, { dpi: 203 })
    expect(out).toContain('^BY2,2,80')
    expect(out).toContain('^BCN,80,Y,N,N,N')
    expect(out).toContain('^FD7894561230^FS')
  })

  it('maps symbologies to their own ZPL commands', () => {
    const build = (symbology: Parameters<typeof barcode>[0]['symbology'], value: string) =>
      compile(
        createTemplate({
          name: 's',
          width: 80,
          height: 40,
          elements: [barcode({ x: 5, y: 5, value, symbology, height: 10 })],
        }),
        {},
        { dpi: 203 },
      )

    expect(build('ean13', '789456123012')).toMatch(/\^BEN,/)
    expect(build('code39', 'ABC')).toMatch(/\^B3N,/)
    expect(build('code93', 'ABC')).toMatch(/\^BAN,/)
    expect(build('itf', '1234')).toMatch(/\^B2N,/)
    expect(build('gs1-128', '0112345')).toMatch(/\^BCN,\d+,Y,N,N,D/)
  })

  it('carries QR error correction in the field data, as ZPL requires', () => {
    const template = createTemplate({
      name: 'qr',
      width: 50,
      height: 50,
      elements: [
        qrcode({ x: 5, y: 5, value: 'https://example.com', moduleWidth: 0.5, errorCorrection: 'Q' }),
      ],
    })
    const out = compile(template, {}, { dpi: 203 })
    expect(out).toContain('^BQN,2,4')
    expect(out).toContain('^FDQA,https://example.com^FS')
  })
})

describe('ZPL escaping', () => {
  it('hex-escapes the characters ZPL treats as command prefixes', () => {
    expect(hexEscape('a^b')).toBe('a_5Eb')
    expect(hexEscape('a~b')).toBe('a_7Eb')
    expect(hexEscape('a\\b')).toBe('a_5Cb')
  })

  it('turns on hex mode only when the data needs it', () => {
    const plain = createTemplate({
      name: 'p',
      width: 50,
      height: 25,
      elements: [text({ x: 2, y: 2, value: '{{v}}', fontSize: 3 })],
    })
    expect(compile(plain, { v: 'SAFE' }, { dpi: 203 })).not.toContain('^FH')
    expect(compile(plain, { v: 'A^B' }, { dpi: 203 })).toContain('^FH^FDA_5EB^FS')
  })
})

describe('ZPL batching', () => {
  it('sends printer settings once and a label format per record', () => {
    const job = compileBatch(
      partTag(),
      [
        { name: 'One', sku: '111' },
        { name: 'Two', sku: '222' },
      ],
      { dpi: 203 },
    )
    expect(job.commands.match(/~SD/g)).toHaveLength(1)
    expect(job.commands.match(/\^XA/g)).toHaveLength(2)
    expect(job.commands.match(/\^XZ/g)).toHaveLength(2)
  })
})
