/**
 * The data sheet: one row per label to print.
 *
 * Columns are the template's fields, so the sheet always matches the label.
 * Rows come from typing, from a CSV, or from a paste out of a spreadsheet,
 * which is the way most product lists actually arrive. Clicking a row number
 * previews that row on the canvas, so a long list can be checked before it
 * is printed.
 */

import { useEffect, useRef, useState, type ClipboardEvent, type PointerEvent } from 'react'
import { parseDelimited, toDelimited, type DataRecord } from '@lblr/core'

import { chooseOpenPath, chooseSavePath, readTextFile, writeTextFile } from '../lib/backend.js'
import { CloseIcon, FolderIcon, PlusIcon, SaveIcon, TrashIcon } from './icons.js'

export interface DataSheetProps {
  fields: string[]
  records: DataRecord[]
  previewRow: number | null
  /** Indices of the rows that print. */
  selectedRows: number[]
  onToggleRow: (row: number) => void
  onSelectAll: (all: boolean) => void
  /** Select or deselect just these rows, for a filtered view. */
  onSelectSome: (rows: number[], on: boolean) => void
  /** Labels each row prints, parallel to `records`. */
  rowCounts: number[]
  onRowCount: (row: number, count: number) => void
  /** Whether the sheet drives the canvas and the default print source. */
  useData: boolean
  onUseData: (on: boolean) => void
  onCell: (row: number, field: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (row: number) => void
  onReplace: (records: DataRecord[]) => void
  onPreviewRow: (row: number | null) => void
  onClose: () => void
  /** Drawer height in pixels, and the request to change it while the top edge is dragged. */
  height: number
  onHeight: (height: number) => void
}

export function DataSheet({
  fields,
  records,
  previewRow,
  selectedRows,
  onToggleRow,
  onSelectAll,
  onSelectSome,
  rowCounts,
  onRowCount,
  useData,
  onUseData,
  onCell,
  onAddRow,
  onRemoveRow,
  onReplace,
  onPreviewRow,
  onClose,
  height,
  onHeight,
}: DataSheetProps) {
  // Dragging the top edge. The height at the press is the reference, so the
  // drawer follows the pointer exactly rather than accumulating rounding.
  const resizeStart = useRef<{ pointerId: number; y: number; height: number } | null>(null)
  const resizeFrame = useRef(0)
  const onResizeDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStart.current = { pointerId: event.pointerId, y: event.clientY, height }
  }
  const onResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current
    if (!start || start.pointerId !== event.pointerId) return
    const next = start.height - (event.clientY - start.y)
    cancelAnimationFrame(resizeFrame.current)
    resizeFrame.current = requestAnimationFrame(() => onHeight(next))
  }
  const onResizeUp = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeStart.current?.pointerId !== event.pointerId) return
    resizeStart.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const [message, setMessage] = useState<string | null>(null)

  // Filtering: a plain substring match across every column, case-insensitive.
  // Rows keep their real index so ticks, quantities and previews stay put.
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = records
    .map((record, index) => ({ record, index }))
    .filter(
      ({ record }) =>
        needle === '' ||
        Object.values(record).some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(needle),
        ),
    )
  const filtering = needle !== ''

  // The header checkbox shows the three states a selection can be in, over
  // the rows that are showing.
  const selectedCount = selectedRows.filter((row) => row < records.length).length
  const labelCount = records.reduce(
    (sum, _, index) => sum + (selectedRows.includes(index) ? (rowCounts[index] ?? 1) : 0),
    0,
  )
  const shownSelected = shown.filter(({ index }) => selectedRows.includes(index)).length
  const allShownSelected = shown.length > 0 && shownSelected === shown.length
  const allSelected = allShownSelected
  const headerCheck = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerCheck.current) {
      headerCheck.current.indeterminate = shownSelected > 0 && !allShownSelected
    }
  }, [selectedCount, allSelected])

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
      // Quantities go out as a qty column, the same column the import reads.
      await writeTextFile(
        path,
        toDelimited({
          fields: [...columns, 'qty'],
          records: records.map((record, index) => ({ ...record, qty: rowCounts[index] ?? 1 })),
        }),
      )
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
    <section
      className={`sheet${useData ? '' : ' inactive'}`}
      aria-label="Data sheet"
      onPaste={onPaste}
    >
      <div
        className="sheet-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the data sheet"
        title="Drag to resize"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onDoubleClick={() => onHeight(240)}
      />
      <header className="sheet-bar">
        <strong>Data</strong>
        <span className="sheet-search">
          <input
            type="search"
            value={query}
            placeholder="Filter rows"
            aria-label="Filter rows"
            disabled={records.length === 0}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
          />
          {filtering ? (
            <span className="hint">
              {shown.length} of {records.length}
            </span>
          ) : null}
        </span>
        <label className="switch" title="Off: the canvas and printing use the sample values">
          <input
            type="checkbox"
            checked={useData}
            onChange={(event) => onUseData(event.target.checked)}
          />
          Design with data
        </label>
        <span className="hint">
          {records.length === 0
            ? 'One row per label.'
            : `${labelCount} label${labelCount === 1 ? '' : 's'} from ${
                selectedCount === records.length
                  ? `all ${records.length} rows`
                  : `${selectedCount} of ${records.length} rows`
              }`}
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
      ) : shown.length === 0 ? (
        <p className="empty sheet-empty">No rows match "{query.trim()}".</p>
      ) : (
        <div className="sheet-scroll">
          <table>
            <thead>
              <tr>
                <th className="sheet-check" scope="col">
                  <input
                    ref={headerCheck}
                    type="checkbox"
                    checked={allSelected}
                    aria-label={
                      filtering
                        ? allSelected
                          ? 'Deselect the rows shown'
                          : 'Select the rows shown'
                        : allSelected
                          ? 'Deselect every row'
                          : 'Select every row'
                    }
                    title={
                      filtering
                        ? allSelected
                          ? 'Deselect the rows shown'
                          : 'Select the rows shown'
                        : allSelected
                          ? 'Deselect every row'
                          : 'Select every row'
                    }
                    onChange={(event) =>
                      filtering
                        ? onSelectSome(
                            shown.map(({ index }) => index),
                            event.target.checked,
                          )
                        : onSelectAll(event.target.checked)
                    }
                  />
                </th>
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
                <th className="sheet-qty" scope="col" title="Labels to print for the row">
                  Qty
                </th>
                <th className="sheet-actions" scope="col" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ record, index: row }) => (
                <tr
                  key={row}
                  className={[
                    previewRow === row ? 'previewing' : '',
                    selectedRows.includes(row) ? '' : 'skipped',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="sheet-check">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(row)}
                      aria-label={`Print row ${row + 1}`}
                      onChange={() => onToggleRow(row)}
                    />
                  </td>
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
                  <td className="sheet-qty">
                    <input
                      type="number"
                      value={rowCounts[row] ?? 1}
                      min={1}
                      max={999}
                      step={1}
                      disabled={!selectedRows.includes(row)}
                      aria-label={`Labels for row ${row + 1}`}
                      onFocus={() => onPreviewRow(row)}
                      onChange={(event) => onRowCount(row, Number(event.target.value))}
                    />
                  </td>
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
