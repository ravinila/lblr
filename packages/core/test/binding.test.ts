import { describe, expect, it } from 'vitest'
import { barcode, createTemplate, fieldsIn, resolve, templateFields, text } from '@lblr/core'

describe('data binding', () => {
  it('substitutes placeholders', () => {
    expect(resolve('{{sku}}', { sku: 'ABC-1' })).toBe('ABC-1')
    expect(resolve('Lot {{lot}} / {{qty}} pcs', { lot: 'A7', qty: 24 })).toBe('Lot A7 / 24 pcs')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(resolve('{{ sku }}', { sku: 'X' })).toBe('X')
  })

  it('resolves a missing field to an empty string rather than leaving braces', () => {
    // Literal braces burnt into a barcode are unrecoverable; a gap is not.
    expect(resolve('{{missing}}', {})).toBe('')
    expect(resolve('a{{missing}}b', {})).toBe('ab')
  })

  it('stringifies non-string values', () => {
    expect(resolve('{{n}}', { n: 0 })).toBe('0')
    expect(resolve('{{b}}', { b: false })).toBe('false')
  })

  it('lists referenced fields without duplicates', () => {
    expect(fieldsIn('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
  })

  it('collects fields across every element in a template', () => {
    const template = createTemplate({
      name: 'part',
      width: 50,
      height: 25,
      elements: [
        text({ x: 2, y: 2, value: '{{name}}', fontSize: 3 }),
        barcode({ x: 2, y: 8, value: '{{sku}}', symbology: 'code128', height: 10 }),
      ],
    })
    expect(templateFields(template)).toEqual(['name', 'sku'])
    expect(template.fields).toEqual(['name', 'sku'])
  })
})
