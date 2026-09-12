/**
 * The data sheet: one row per label to print.
 *
 * Columns are the template's fields, so the sheet always matches the label.
 * Rows come from typing, from a CSV, or from a paste out of a spreadsheet,
 * which is the way most product lists actually arrive. Clicking a row number
 * previews that row on the canvas, so a long list can be checked before it
 * is printed.
 */

import { useState, type ClipboardEvent } from 'react'
import { parseDelimited, toDelimited, type DataRecord } from '@lblr/core'

import { chooseOpenPath, chooseSavePath, readTextFile, writeTextFile } from '../lib/backend.js'
import { CloseIcon, FolderIcon, PlusIcon, SaveIcon, TrashIcon } from './icons.js'

export interface DataSheetProps {
  fields: string[]
  records: DataRecord[]
  previewRow: number | null
  onCell: (row: number, field: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (row: number) => void
  onReplace: (records: DataRecord[]) => void
  onPreviewRow: (row: number | null) => void
  onClose: () => void
}

export function DataSheet({
  fields,
  records,
  previewRow,
  onCell,
  onAddRow,
  onRemoveRow,
  onReplace,
  onPreviewRow,
  onClose,
}: DataSheetProps) {
  const [message, setMessage] = useState<string | null>(null)

  // Columns are the template's fields plus anything the data brought along,
  // so nothing imported is silently dropped.
  const extra = Array.from(
    new Set(
      records.flatMap((record) => Object.keys(record)).filter((key) => !fields.includes(key)),
    ),
  )
  const columns = [...fields, ...extra]

  const importFile = async () => {
    const path = await chooseOpenPath('data')
    if (!path) return
    try {
      const table = parseDelimited(await readTextFile(path), fields)
      onReplace(table.records)
      setMessage(`Loaded ${table.records.length} rows from ${path}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const exportFile = async () => {
    const path = await chooseSavePath('labels.csv', 'data')
    if (!path) return
    try {
      await writeTextFile(path, toDelimited({ fields: columns, records }))
      setMessage(`Saved ${records.length} rows to ${path}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  /** Rows pasted from a spreadsheet land as new rows, not into one cell. */
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const text = event.clipboardData.getData('text/plain')
    if (!/[\t\r\n]/.test(text)) return // a single value: let the cell take it
    event.preventDefault()
    const table = parseDelimited(text, fields)
    if (table.records.length === 0) return
    onReplace([...records, ...table.records])
    setMessage(`Pasted ${table.records.length} rows`)
  }

  return (
    <section className="sheet" aria-label="Data sheet" onPaste={onPaste}>
      <header className="sheet-bar">
        <strong>Data</strong>
        <span className="hint">
          {records.length === 0
            ? 'One row per label.'
            : `${records.length} row${records.length === 1 ? '' : 's'}`}
        </span>
        {message ? <span className="hint sheet-message">{message}</span> : null}
        <span className="spacer" />
        <button className="btn" onClick={onAddRow} disabled={columns.length === 0}>
          <PlusIcon />
          Row
        </button>
        <button className="btn" onClick={importFile}>
          <FolderIcon />
          Import CSV
        </button>
        <button className="btn" onClick={exportFile} disabled={records.length === 0}>
          <SaveIcon />
          Export CSV
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => onReplace([])}
          disabled={records.length === 0}
          title="Remove every row"
        >
          Clear
        </button>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close the data sheet">
          <CloseIcon />
        </button>
      </header>

      {columns.length === 0 ? (
        <p className="empty sheet-empty">
          Put a {'{{field}}'} placeholder in a text or barcode first. Each placeholder becomes a
          column here.
        </p>
      ) : records.length === 0 ? (
        <p className="empty sheet-empty">
          Paste rows from a spreadsheet, import a CSV, or add a row. Columns: {columns.join(', ')}.
        </p>
      ) : (
        <div className="sheet-scroll">
          <table>
            <thead>
              <tr>
                <th className="sheet-index" scope="col">
                  #
                </th>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className={fields.includes(column) ? '' : 'sheet-extra'}
                  >
                    {column}
                  </th>
                ))}
                <th className="sheet-actions" scope="col" />
              </tr>
            </thead>
            <tbody>
              {records.map((record, row) => (
                <tr key={row} className={previewRow === row ? 'previewing' : ''}>
                  <td className="sheet-index">
                    <button
                      className="sheet-row-button"
                      title="Show this row on the canvas"
                      aria-pressed={previewRow === row}
                      onClick={() => onPreviewRow(previewRow === row ? null : row)}
                    >
                      {row + 1}
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td key={column}>
                      <input
                        value={String(record[column] ?? '')}
                        aria-label={`${column}, row ${row + 1}`}
                        onFocus={() => onPreviewRow(row)}
                        onChange={(event) => onCell(row, column, event.target.value)}
                      />
                    </td>
                  ))}
                  <td className="sheet-actions">
                    <button
                      className="icon-btn"
                      title="Remove this row"
                      aria-label={`Remove row ${row + 1}`}
                      onClick={() => onRemoveRow(row)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
