import { describe, expect, it } from 'vitest'
import { barcode, box, createTemplate, line, qrcode, text } from '@lblr/core'
import {
  compile,
  compileBatch,
  compileJob,
  compileMaintenance,
  compileTextCalibration,
  escapeTsplString,
} from '@lblr/tspl'

const partTag = () =>
  createTemplate({
    name: 'part-tag',
    width: 50,
    height: 25,
    gap: 2,
    elements: [
      text({ x: 3, y: 3, value: '{{name}}', fontSize: 3.5 }),
      barcode({
        x: 3,
        y: 10,
        value: '{{sku}}',
        symbology: 'code128',
        height: 10,
      }),
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
    const mark = createTemplate({
      name: 'm',
      width: 50,
      height: 25,
      mediaType: 'blackmark',
    })
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

  it('breaks wrapped text into one TEXT per line, never a BLOCK', () => {
    const template = createTemplate({
      name: 't',
      width: 50,
      height: 25,
      elements: [
        text({
          x: 2,
          y: 2,
          value: 'wraps across two lines here',
          fontSize: 3,
          maxWidth: 40,
          align: 'center',
        }),
      ],
    })
    const out = compile(template, {}, { dpi: 203 })
    expect(out).not.toContain('BLOCK')
    // 40 mm at 1.8 mm per character is 22 characters per line.
    expect(out).toContain('"wraps across two lines"')
    expect(out).toContain('"here"')
    // Centred: both lines are anchored at the middle of the 40 mm box, which
    // is 160 dots right of x, with the TSPL2 centre-alignment argument; the
    // second line sits one pitch lower.
    expect(out).toMatch(/TEXT 176,16,"0",0,24,24,2,"wraps across two lines"/)
    expect(out).toMatch(/TEXT 176,47,"0",0,24,24,2,"here"/)
    // Unboxed text carries no alignment argument at all.
    expect(compile(partTag(), { name: 'A', sku: '1' }, { dpi: 203 })).toContain(
      'TEXT 24,24,"0",0,28,28,"A"',
    )
  })

  it('scales the text arguments for printers that draw the font too large', () => {
    const out = compile(
      partTag(),
      { name: 'ACME', sku: '1' },
      { dpi: 203, textScale: { height: 0.5, width: 0.55 } },
    )
    expect(out).toContain('TEXT 24,24,"0",0,15,14,"ACME"')
  })

  it('prints the text size check without any correction', () => {
    const out = compileTextCalibration(partTag(), {
      dpi: 203,
      textScale: { height: 0.5, width: 0.5 },
    })
    expect(out).toContain('BOX ')
    expect(out).toContain('"0123456789"')
    // 4 mm cap height at 203 dpi is 32 dots, uncorrected.
    expect(out).toMatch(/TEXT \d+,\d+,"0",0,32,32,"0123456789"/)
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
        qrcode({
          x: 5,
          y: 5,
          value: 'https://example.com',
          moduleWidth: 0.5,
          errorCorrection: 'Q',
        }),
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

describe('TSPL multi-up layout', () => {
  it('sizes the media to the whole grid and stamps every cell', () => {
    const out = compile(
      partTag(),
      { name: 'ACME', sku: '123' },
      { dpi: 203, layout: { columns: 3, rows: 3 } },
    )
    expect(out).toContain('SIZE 154 mm, 79 mm')
    expect(out).toContain('GAP 2 mm, 0 mm')
    // Column two starts 52 mm across, which is 416 dots; row two 27 mm down, 216 dots.
    expect(out).toContain('TEXT 24,24,"0",0,28,28,"ACME"')
    expect(out).toContain('TEXT 440,24,"0",0,28,28,"ACME"')
    expect(out).toContain('TEXT 24,240,"0",0,28,28,"ACME"')
    expect(out).toContain('TEXT 855,456,"0",0,28,28,"ACME"')
    expect(out.match(/TEXT /g)).toHaveLength(9)
    expect(out.match(/PRINT /g)).toHaveLength(1)
  })

  it('fills a batch across the grid in reading order, leaving spare cells blank', () => {
    const records = Array.from({ length: 4 }, (_, i) => ({
      name: `L${i}`,
      sku: '1',
    }))
    const out = compileBatch(partTag(), records, {
      dpi: 203,
      layout: { columns: 3, rows: 1 },
    })
    expect(out.commands.match(/PRINT /g)).toHaveLength(2)
    expect(out.commands).toContain('TEXT 440,24,"0",0,28,28,"L1"')
    expect(out.commands).toContain('TEXT 855,24,"0",0,28,28,"L2"')
    expect(out.commands).toContain('TEXT 24,24,"0",0,28,28,"L3"')
  })

  it('prefers a layout stored on the template when none is passed', () => {
    const template = partTag()
    template.defaults.layout = { columns: 2, rows: 1, columnGap: 4 }
    expect(compile(template, {}, { dpi: 203 })).toContain('SIZE 104 mm, 25 mm')
  })
})

describe('TSPL print position', () => {
  it('moves the image right and down with REFERENCE', () => {
    const template = partTag()
    template.defaults.offsetX = 2
    template.defaults.offsetY = 1
    const out = compile(template, {}, { dpi: 203 })
    expect(out).toContain('REFERENCE 16,8')
    expect(out).not.toContain('SHIFT')
  })

  it('pulls the image up or left with SHIFT, which REFERENCE cannot do', () => {
    const template = partTag()
    template.defaults.offsetX = -1
    template.defaults.offsetY = -2
    expect(compile(template, {}, { dpi: 203 })).toContain('SHIFT -8,-16')

    template.defaults.offsetX = 0
    expect(compile(template, {}, { dpi: 203 })).toContain('SHIFT -16')

    template.defaults.offsetX = 1
    const mixed = compile(template, {}, { dpi: 203 })
    expect(mixed).toContain('REFERENCE 8,0')
    expect(mixed).toContain('SHIFT -16')
  })

  it('sets the tear-off position with OFFSET', () => {
    const template = partTag()
    template.defaults.tearOffset = 3.5
    expect(compile(template, {}, { dpi: 203 })).toContain('OFFSET 3.5 mm')
    template.defaults.tearOffset = 0
    expect(compile(template, {}, { dpi: 203 })).not.toContain('OFFSET')
  })

  it('compiles feed and calibration jobs that carry the media setup', () => {
    const feed = compileMaintenance(partTag(), 'feed', { dpi: 203 })
    expect(feed).toContain('SIZE 50 mm, 25 mm')
    expect(feed).toContain('GAP 2 mm, 0 mm')
    expect(feed.trim().endsWith('FORMFEED')).toBe(true)
    expect(feed).not.toContain('PRINT')

    expect(compileMaintenance(partTag(), 'calibrate')).toContain('GAPDETECT')

    // Moving the paper: one label by default, or a set distance, either way.
    expect(compileMaintenance(partTag(), 'forward', { dpi: 203 }).trim().endsWith('FEED 200')).toBe(
      true,
    )
    expect(
      compileMaintenance(partTag(), 'backward', { dpi: 203, distance: 5 })
        .trim()
        .endsWith('BACKFEED 40'),
    ).toBe(true)
    expect(compileMaintenance(partTag(), 'backward', { dpi: 203, distance: 0.01 })).toContain(
      'BACKFEED 1',
    )
    const mark = partTag()
    mark.media.type = 'blackmark'
    expect(compileMaintenance(mark, 'calibrate')).toContain('BLINEDETECT')
  })
})
