import { describe, expect, it } from 'vitest'
import {
  barcode,
  canPrint,
  checkSymbologyContent,
  createTemplate,
  qrcode,
  text,
  validateTemplate,
  type ValidationIssue,
} from '@lblr/core'

const codes = (issues: ValidationIssue[]): string[] => issues.map((issue) => issue.code)

describe('template validation', () => {
  it('passes a sane label', () => {
    const template = createTemplate({
      name: 'ok',
      width: 50,
      height: 25,
      elements: [
        text({ x: 3, y: 3, value: 'ACME', fontSize: 3.5 }),
        barcode({ x: 3, y: 10, value: '7894561230', symbology: 'code128', height: 10 }),
      ],
    })
    expect(canPrint(validateTemplate(template, { dpi: 203 }))).toBe(true)
  })

  it('flags an element that runs off the label', () => {
    const template = createTemplate({
      name: 'overflow',
      width: 50,
      height: 25,
      elements: [text({ x: 48, y: 3, value: 'far too long to fit', fontSize: 4 })],
    })
    const issues = validateTemplate(template, { dpi: 203 })
    expect(codes(issues)).toContain('layout/overflow')
    expect(canPrint(issues)).toBe(false)
  })

  it('flags a negative position', () => {
    const template = createTemplate({
      name: 'negative',
      width: 50,
      height: 25,
      elements: [text({ x: -2, y: 3, value: 'A', fontSize: 3 })],
    })
    expect(codes(validateTemplate(template, { dpi: 203 }))).toContain('layout/negative-position')
  })

  it('warns when a barcode module does not land on a whole dot', () => {
    const template = createTemplate({
      name: 'rounding',
      width: 50,
      height: 25,
      // 0.3 mm is 2.4 dots at 203 dpi and cannot be printed as specified.
      elements: [
        barcode({
          x: 5,
          y: 5,
          value: '123456',
          symbology: 'code128',
          height: 10,
          moduleWidth: 0.3,
        }),
      ],
    })
    expect(codes(validateTemplate(template, { dpi: 203 }))).toContain('barcode/module-rounding')
  })

  it('warns about a barcode with no quiet zone', () => {
    const template = createTemplate({
      name: 'quiet',
      width: 60,
      height: 25,
      elements: [barcode({ x: 0.5, y: 5, value: '123456', symbology: 'code128', height: 10 })],
    })
    expect(codes(validateTemplate(template, { dpi: 203 }))).toContain('barcode/quiet-zone')
  })

  it('rejects content the symbology cannot encode', () => {
    const template = createTemplate({
      name: 'bad-ean',
      width: 50,
      height: 30,
      elements: [barcode({ x: 5, y: 5, value: 'ABC', symbology: 'ean13', height: 10 })],
    })
    const issues = validateTemplate(template, { dpi: 203 })
    expect(codes(issues)).toContain('barcode/invalid-content')
    expect(canPrint(issues)).toBe(false)
  })

  it('downgrades invalid content to a warning while it is still a placeholder', () => {
    const template = createTemplate({
      name: 'unbound-ean',
      width: 50,
      height: 30,
      elements: [barcode({ x: 5, y: 5, value: '{{ean}}', symbology: 'ean13', height: 10 })],
    })
    const issues = validateTemplate(template, { dpi: 203 })
    const issue = issues.find((candidate) => candidate.code === 'barcode/invalid-content')
    expect(issue?.severity).toBe('warning')
    expect(canPrint(issues)).toBe(true)
  })

  it('warns about an unreadably small QR module', () => {
    const template = createTemplate({
      name: 'tiny-qr',
      width: 50,
      height: 30,
      elements: [qrcode({ x: 5, y: 5, value: 'https://example.com', moduleWidth: 0.25 })],
    })
    expect(codes(validateTemplate(template, { dpi: 203 }))).toContain('qr/small-module')
  })

  it('warns when darkness and speed are both high', () => {
    const template = createTemplate({
      name: 'smear',
      width: 50,
      height: 25,
      defaults: { darkness: 14, speed: 6 },
    })
    expect(codes(validateTemplate(template, { dpi: 203 }))).toContain('print/darkness-speed')
  })
})

describe('symbology content rules', () => {
  it('accepts valid values', () => {
    expect(checkSymbologyContent('ean13', '789456123012')).toBeNull()
    expect(checkSymbologyContent('code39', 'ABC-123')).toBeNull()
    expect(checkSymbologyContent('code128', 'anything ~!@')).toBeNull()
    expect(checkSymbologyContent('itf', '12345678')).toBeNull()
    expect(checkSymbologyContent('codabar', 'A1234B')).toBeNull()
  })

  it('rejects invalid values', () => {
    expect(checkSymbologyContent('ean13', '12345')).toMatch(/12 digits/)
    expect(checkSymbologyContent('code39', 'lowercase')).toMatch(/Lowercase/)
    expect(checkSymbologyContent('itf', '12345')).toMatch(/even number/)
    expect(checkSymbologyContent('msi', '12A')).toMatch(/digits only/)
    expect(checkSymbologyContent('code128', '')).toMatch(/no content/)
  })
})
