import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseDelimited, splitDelimited, toDelimited } from '@lblr/core'

describe('delimited data', () => {
  it('detects tabs from a spreadsheet paste and commas from a CSV', () => {
    expect(detectDelimiter('name\tsku\nA\t1')).toBe('\t')
    expect(detectDelimiter('name,sku\nA,1')).toBe(',')
    expect(detectDelimiter('name;sku;price')).toBe(';')
  })

  it('honours quotes, doubled quotes and line breaks inside cells', () => {
    const rows = splitDelimited('name,note\r\n"Bolt, M6","He said ""hi""\nthen left"\r\n')
    expect(rows).toEqual([
      ['name', 'note'],
      ['Bolt, M6', 'He said "hi"\nthen left'],
    ])
  })

  it('uses the first row as the header when it matches the template fields', () => {
    const table = parseDelimited('SKU\tName\n123\tBolt\n456\tNut', ['name', 'sku'])
    expect(table.fields).toEqual(['sku', 'name'])
    expect(table.records).toEqual([
      { sku: '123', name: 'Bolt' },
      { sku: '456', name: 'Nut' },
    ])
  })

  it('maps headerless rows onto the template fields by position', () => {
    const table = parseDelimited('Bolt\t123\nNut\t456', ['name', 'sku'])
    expect(table.records).toEqual([
      { name: 'Bolt', sku: '123' },
      { name: 'Nut', sku: '456' },
    ])
  })

  it('takes the first row as the header when no fields are known', () => {
    const table = parseDelimited('name,sku,\nBolt,123,x')
    expect(table.fields).toEqual(['name', 'sku', 'column 3'])
    expect(table.records[0]).toEqual({ name: 'Bolt', sku: '123', 'column 3': 'x' })
  })

  it('round-trips through CSV', () => {
    const table = { fields: ['name', 'sku'], records: [{ name: 'Bolt, M6', sku: '1"' }] }
    const csv = toDelimited(table)
    expect(csv).toBe('name,sku\r\n"Bolt, M6","1"""\r\n')
    expect(parseDelimited(csv)).toEqual(table)
  })
})
