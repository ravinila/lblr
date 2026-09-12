/**
 * Tabular data for batch runs.
 *
 * A sheet is a list of records keyed by field name. It arrives as CSV or as
 * rows pasted from a spreadsheet, which is tab-separated, so the parser
 * takes either and works out which it was given. Quoting follows RFC 4180:
 * a field with the delimiter, a quote or a line break is wrapped in double
 * quotes and an embedded quote is doubled.
 */

import type { DataRecord } from './types.js'

export interface DataTable {
  fields: string[]
  records: DataRecord[]
}

/** The delimiter that splits the first line into the most cells. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  let best = ','
  let bestCount = -1
  for (const candidate of ['\t', ',', ';', '|']) {
    const count = firstLine.split(candidate).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** Split delimited text into rows of cells, honouring quotes. */
export function splitDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? ''
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // A trailing newline leaves a lone empty row; drop rows that are all blank.
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

/**
 * Rows of cells to records. With `fields` given, the first row is treated
 * as a header only if it matches those fields; otherwise every row is data
 * mapped onto the fields by position. Without `fields`, the first row is
 * the header.
 */
export function rowsToTable(rows: string[][], fields?: string[]): DataTable {
  if (rows.length === 0) return { fields: fields ?? [], records: [] }
  const first = rows[0] ?? []
  const normalise = (value: string) => value.trim().toLowerCase()

  let header: string[]
  let body: string[][]
  if (fields && fields.length > 0) {
    const looksLikeHeader =
      first.length > 0 &&
      first.every((cell) => fields.some((f) => normalise(f) === normalise(cell)))
    if (looksLikeHeader) {
      header = first.map(
        (cell) => fields.find((f) => normalise(f) === normalise(cell)) ?? cell.trim(),
      )
      body = rows.slice(1)
    } else {
      header = fields
      body = rows
    }
  } else {
    header = first.map((cell, index) => cell.trim() || `column ${index + 1}`)
    body = rows.slice(1)
  }

  const records = body.map((cells) => {
    const record: DataRecord = {}
    header.forEach((field, index) => {
      record[field] = (cells[index] ?? '').trim()
    })
    return record
  })
  return { fields: header, records }
}

/** Parse CSV or pasted spreadsheet text. */
export function parseDelimited(text: string, fields?: string[]): DataTable {
  return rowsToTable(splitDelimited(text), fields)
}

function quote(value: unknown, delimiter: string): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Records back to CSV, header first. */
export function toDelimited(table: DataTable, delimiter = ','): string {
  const lines = [table.fields.map((field) => quote(field, delimiter)).join(delimiter)]
  for (const record of table.records) {
    lines.push(table.fields.map((field) => quote(record[field], delimiter)).join(delimiter))
  }
  return lines.join('\r\n') + '\r\n'
}

/** A record with every field present and blank. */
export function blankRecord(fields: string[]): DataRecord {
  const record: DataRecord = {}
  for (const field of fields) record[field] = ''
  return record
}
