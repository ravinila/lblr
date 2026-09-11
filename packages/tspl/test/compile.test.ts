import { describe, expect, it } from 'vitest'
import { barcode, box, createTemplate, line, qrcode, text } from '@lblr/core'
import { compile, compileBatch, compileJob, escapeTsplString } from '@lblr/tspl'

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

describe('TSPL media setup', () => {
  it('emits the label geometry in millimetres', () => {
    const out = compile(partTag(), { name: 'ACME', sku: '7894561230' }, { dpi: 203 })
    expect(out).toContain('SIZE 50 mm, 25 mm')
    expect(out).toContain('GAP 2 mm, 0 mm')
    expect(out).toContain('DIRECTION 1,0')
    expect(out).toContain('SPEED 4')
    expect(out).toContain('DENSITY 8')
    expect(out).toContain('CODEPAGE UTF-8')
  })

  it('uses BLINE for black-mark stock and a zero gap for continuous', () => {
    const mark = createTemplate({ name: 'm', width: 50, height: 25, mediaType: 'blackmark' })
    expect(compile(mark, {}, { dpi: 203 })).toContain('BLINE 2 mm, 0 mm')

    const continuous = createTemplate({
      name: 'c',
      width: 50,
      height: 25,
      mediaType: 'continuous',
    })
    expect(compile(continuous, {}, { dpi: 203 })).toContain('GAP 0 mm, 0 mm')
  })

  it('can be omitted so a batch sends it only once', () => {
    const out = compile(partTag(), {}, { dpi: 203, includeSetup: false })
    expect(out).not.toContain('SIZE')
    expect(out).toContain('CLS')
  })

  it('terminates lines with CRLF, which is what the firmware expects', () => {
    expect(compile(partTag(), {}, { dpi: 203 })).toContain('\r\n')
  })
})

describe('TSPL element output', () => {
  it('positions text in dots and sizes the scalable font in dots', () => {
    const out = compile(partTag(), { name: 'ACME', sku: '123' }, { dpi: 203 })
    // 3 mm is 24 dots and a 3.5 mm cap height is 28 dots at 203 dpi.
    expect(out).toContain('TEXT 24,24,"0",0,28,28,"ACME"')
  })

  it('double-strikes bold text one dot to the right', () => {
    const template = createTemplate({
      name: 'bold',
      width: 50,
      height: 25,
      elements: [text({ x: 3, y: 3, value: 'HEAVY', fontSize: 3, bold: true })],
    })
    const out = compile(template, {}, { dpi: 203 })
    expect(out).toContain('TEXT 24,24,"0",0,24,24,"HEAVY"')
    expect(out).toContain('TEXT 25,24,"0",0,24,24,"HEAVY"')
  })

  it('emits BLOCK when the text has a width, with an alignment argument', () => {
    const template = createTemplate({
      name: 'wrapped',
      width: 50,
      height: 25,
      elements: [
        text({ x: 2, y: 2, value: 'wraps across lines', fontSize: 3, maxWidth: 40, align: 'center' }),
      ],
    })
    const out = compile(template, {}, { dpi: 203 })
    expect(out).toMatch(/BLOCK 16,16,320,\d+,"0",0,24,24,0,2,"wraps across lines"/)
  })

  it('writes barcodes with narrow and wide bars in whole dots', () => {
    const out = compile(partTag(), { name: 'X', sku: '7894561230' }, { dpi: 203 })
    // 0.25 mm narrow is 2 dots, and the default 2:1 ratio makes the wide bar 4.
    expect(out).toContain('BARCODE 24,80,"128",80,2,0,2,4,"7894561230"')
  })

  it('maps symbologies to TSPL type codes', () => {
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

    expect(build('ean13', '789456123012')).toContain('"EAN13"')
    expect(build('code39', 'ABC')).toContain('"39"')
    expect(build('itf', '1234')).toContain('"25"')
    expect(build('gs1-128', '0112345')).toContain('"EAN128"')
    expect(build('codabar', 'A12B')).toContain('"CODA"')
  })

  it('writes QR codes with the module size as the cell width', () => {
    const template = createTemplate({
      name: 'qr',
      width: 50,
      height: 50,
      elements: [
        qrcode({ x: 5, y: 5, value: 'https://example.com', moduleWidth: 0.5, errorCorrection: 'Q' }),
      ],
    })
    expect(compile(template, {}, { dpi: 203 })).toContain(
      'QRCODE 40,40,Q,4,A,0,"https://example.com"',
    )
  })

  it('warns when a QR module exceeds the ten dot cell limit', () => {
    const template = createTemplate({
      name: 'big-qr',
      width: 80,
      height: 80,
      elements: [qrcode({ x: 5, y: 5, value: 'x', moduleWidth: 2 })],
    })
    const job = compileJob(template, {}, { dpi: 203 })
    expect(job.warnings.join(' ')).toMatch(/caps cell size at 10 dots/)
  })

  it('draws filled boxes as bars and outlined boxes as BOX', () => {
    const filled = createTemplate({
      name: 'f',
      width: 50,
      height: 25,
      elements: [box({ x: 2, y: 2, width: 10, height: 5, thickness: 0.3, filled: true })],
    })
    expect(compile(filled, {}, { dpi: 203 })).toContain('BAR 16,16,80,40')

    const outlined = createTemplate({
      name: 'o',
      width: 50,
      height: 25,
      elements: [box({ x: 2, y: 2, width: 10, height: 5, thickness: 0.5 })],
    })
    expect(compile(outlined, {}, { dpi: 203 })).toContain('BOX 16,16,96,56,4')
  })

  it('draws a rotated line as a tall thin bar', () => {
    const template = createTemplate({
      name: 'l',
      width: 50,
      height: 25,
      elements: [line({ x: 5, y: 2, length: 20, thickness: 0.5, rotation: 90 })],
    })
    expect(compile(template, {}, { dpi: 203 })).toContain('BAR 40,16,4,160')
  })

  it('reports images as skipped rather than silently dropping them', () => {
    const template = createTemplate({
      name: 'img',
      width: 50,
      height: 25,
      elements: [
        {
          id: 'logo',
          type: 'image',
          name: 'Logo',
          x: 2,
          y: 2,
          width: 10,
          height: 10,
          data: 'iVBORw0KGgo=',
        },
      ],
    })
    const job = compileJob(template, {}, { dpi: 203 })
    expect(job.warnings).toHaveLength(1)
    expect(job.warnings[0]).toMatch(/does not yet emit bitmaps/)
  })
})

describe('TSPL batching', () => {
  it('sends setup once and one CLS/PRINT cycle per record', () => {
    const job = compileBatch(
      partTag(),
      [
        { name: 'One', sku: '111' },
        { name: 'Two', sku: '222' },
        { name: 'Three', sku: '333' },
      ],
      { dpi: 203 },
    )
    expect(job.commands.match(/SIZE/g)).toHaveLength(1)
    expect(job.commands.match(/CLS/g)).toHaveLength(3)
    expect(job.commands.match(/PRINT/g)).toHaveLength(3)
    expect(job.commands).toContain('"One"')
    expect(job.commands).toContain('"333"')
  })

  it('honours a copy count override', () => {
    const out = compile(partTag(), {}, { dpi: 203, copies: 5 })
    expect(out).toContain('PRINT 5,1')
  })
})

describe('TSPL string escaping', () => {
  it('escapes quotes and backslashes so they cannot terminate a literal', () => {
    expect(escapeTsplString('say "hi"')).toBe('say \\"hi\\"')
    expect(escapeTsplString('a\\b')).toBe('a\\\\b')
  })

  it('escapes quotes coming from bound data', () => {
    const template = createTemplate({
      name: 'q',
      width: 50,
      height: 25,
      elements: [text({ x: 2, y: 2, value: '{{v}}', fontSize: 3 })],
    })
    expect(compile(template, { v: '12" pipe' }, { dpi: 203 })).toContain('"12\\" pipe"')
  })
})
