import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  canPrint,
  createTemplate,
  dotsPerMm,
  findDesign,
  layoutSize,
  mmToDots,
  parseTemplate,
  resolveLayout,
  serializeTemplate,
  stockLayout,
  templateFields,
  validateTemplate,
  type LabelElement,
} from '@lblr/core'
import { compileBatch as batchTspl, compileJob as compileTspl } from '@lblr/tspl'
import { compileBatch as batchZpl, compileJob as compileZpl } from '@lblr/zpl'

import {
  FolderIcon,
  LabelMarkIcon,
  PlusIcon,
  PrintIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from './components/icons.js'
import { DataSheet } from './components/DataSheet.js'
import { Inspector } from './components/Inspector.js'
import { PanelEdge } from './components/PanelEdge.js'
import { LabelCanvas, RULER, drawnSize, type CanvasView } from './components/LabelCanvas.js'
import { NewLabelDialog, type NewLabelSpec } from './components/NewLabelDialog.js'
import { PrintDialog } from './components/PrintDialog.js'
import { Rail } from './components/Rail.js'
import { chooseOpenPath, chooseSavePath, readTextFile, writeTextFile } from './lib/backend.js'
import { usePanel } from './state/usePanel.js'
import {
  ZOOM_DEFAULT,
  clampZoom,
  formatZoom,
  newElement,
  stepZoom,
  useDesigner,
} from './state/designer.js'

const DPI_OPTIONS = [203, 300, 600]

/** The data drawer's height in pixels, remembered between launches. */
const SHEET_HEIGHT_KEY = 'lblr.sheetHeight'
const DEFAULT_SHEET_HEIGHT = 240
const MIN_SHEET_HEIGHT = 120

/** Whether the canvas shows the whole roll or one label, remembered per machine. */
const VIEW_KEY = 'lblr.view'

/** Side panel sizes: default, and how far they can be dragged. */
const RAIL_PANEL = { width: 236, min: 180, max: 420 }
const INSPECTOR_PANEL = { width: 296, min: 240, max: 560 }
/** Width of a collapsed panel: just enough for its reopen button. */
const COLLAPSED_WIDTH = 28

/** Breathing room around a strip that has been zoomed to fit, in pixels. */
const FIT_MARGIN = 72

export function App() {
  const { state, dispatch, selected, update } = useDesigner()
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [printing, setPrinting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  const {
    template,
    dpi,
    zoom,
    language,
    sample,
    records,
    selectedRows,
    rowCounts,
    useData,
    previewRow,
  } = state
  // Data drives the design only when switched on and there is some.
  const dataOn = useData && records.length > 0
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rail, railControls] = usePanel('lblr.rail', RAIL_PANEL)
  const [inspector, inspectorControls] = usePanel('lblr.inspector', INSPECTOR_PANEL)
  const [sheetHeight, setSheetHeight] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(SHEET_HEIGHT_KEY))
      return stored >= MIN_SHEET_HEIGHT ? stored : DEFAULT_SHEET_HEIGHT
    } catch {
      return DEFAULT_SHEET_HEIGHT
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(SHEET_HEIGHT_KEY, String(sheetHeight))
    } catch {
      // Losing the drawer height is not worth a crash.
    }
  }, [sheetHeight])

  // What fills the placeholders on the canvas: the previewed sheet row when
  // there is one, otherwise the sample values.
  const activeRow = dataOn
    ? (previewRow ?? selectedRows.find((row) => row < records.length) ?? null)
    : null
  const previewed = activeRow !== null ? records[activeRow] : undefined
  const data = useMemo(
    () => (previewed ? { ...sample, ...previewed } : sample),
    [sample, previewed],
  )

  const issues = useMemo(() => validateTemplate(template, { dpi, data }), [template, dpi, data])

  const textScale = state.textScale[language]
  const job = useMemo(() => {
    const compile = language === 'tspl' ? compileTspl : compileZpl
    return compile(template, data, { dpi, textScale })
  }, [template, data, dpi, language, textScale])

  // The ticked rows of the sheet as one job, only when there are any.
  // Every ticked row, repeated by its count, in sheet order.
  const selectedRecords = useMemo(
    () =>
      records.flatMap((record, index) =>
        selectedRows.includes(index)
          ? Array.from({ length: rowCounts[index] ?? 1 }, () => record)
          : [],
      ),
    [records, selectedRows, rowCounts],
  )
  // What the canvas shows around the edited cell: the records that follow the
  // previewed row in print order, quantities applied, covering the rest of
  // the pass and the next row. Nothing when the sheet is empty.
  const canvasSequence = useMemo(() => {
    if (!dataOn || selectedRecords.length === 0) return undefined
    const layout = resolveLayout(template)
    const slots = layout.columns * layout.rows - 1 + layout.columns
    const ordered = records.flatMap((record, index) =>
      selectedRows.includes(index)
        ? Array.from({ length: rowCounts[index] ?? 1 }, () => ({ record, row: index }))
        : [],
    )
    const start = activeRow === null ? -1 : ordered.findIndex((item) => item.row === activeRow)
    if (start < 0) return undefined
    return Array.from({ length: slots }, (_, offset) => ordered[start + 1 + offset]?.record ?? null)
  }, [dataOn, selectedRecords.length, records, selectedRows, rowCounts, activeRow, template])

  const selectedRowCount = useMemo(
    () => selectedRows.filter((row) => row < records.length).length,
    [selectedRows, records.length],
  )
  const batch = useMemo(() => {
    if (selectedRecords.length === 0) return null
    const compile = language === 'tspl' ? batchTspl : batchZpl
    return compile(template, selectedRecords, { dpi, textScale })
  }, [template, selectedRecords, dpi, language, textScale])

  const fields = useMemo(() => templateFields(template), [template])
  const pass = useMemo(
    () => layoutSize(template.media, stockLayout(template.media)),
    [template.media],
  )
  const [view, setView] = useState<CanvasView>(() => {
    try {
      return window.localStorage.getItem(VIEW_KEY) === 'label' ? 'label' : 'roll'
    } catch {
      return 'roll'
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view)
    } catch {
      // A forgotten view preference is not worth a crash.
    }
  }, [view])
  const drawn = useMemo(() => drawnSize(template, view), [template, view])
  const across = template.media.columns ?? 1

  const addElement = useCallback(
    (kind: LabelElement['type']) => {
      // Drop new elements a little inside the top-left corner rather than on
      // the media edge, where they would immediately fail the bounds check.
      dispatch({ type: 'add', element: newElement(kind, { x: 2, y: 2 }) })
    },
    [dispatch],
  )

  const save = useCallback(async () => {
    const path = state.path ?? (await chooseSavePath(`${template.name}.lblr`))
    if (!path) return
    try {
      await writeTextFile(path, serializeTemplate(template))
      dispatch({ type: 'saved', path })
      setMessage(`Saved to ${path}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }, [dispatch, state.path, template])

  const open = useCallback(async () => {
    const path = await chooseOpenPath()
    if (!path) return
    try {
      const loaded = parseTemplate(await readTextFile(path))
      dispatch({ type: 'load', template: loaded, path })
      setMessage(`Opened ${loaded.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }, [dispatch])

  const startNew = useCallback(() => {
    if (state.dirty && !window.confirm('Discard unsaved changes to this label?')) return
    setCreating(true)
  }, [state.dirty])

  const createNew = useCallback(
    (spec: NewLabelSpec) => {
      const design = findDesign(spec.design)
      const size = { width: spec.width, height: spec.height }
      dispatch({
        type: 'new',
        template: createTemplate({
          name: spec.name,
          width: spec.width,
          height: spec.height,
          gap: spec.gap,
          columns: spec.columns,
          columnGap: spec.columnGap,
          mediaType: spec.mediaType,
          elements: design?.build(size) ?? [],
        }),
      })
      // The design's sample values, so the canvas shows a real label at once.
      for (const [field, value] of Object.entries(design?.sample ?? {})) {
        dispatch({ type: 'sample', field, value: String(value ?? '') })
      }
      setCreating(false)
      setMessage(
        spec.columns > 1
          ? `New ${spec.width} × ${spec.height} mm label, ${spec.columns} across`
          : `New ${spec.width} × ${spec.height} mm label`,
      )
    },
    [dispatch],
  )

  // --- zoom ----------------------------------------------------------------

  // Whether the zoom is the person's own choice rather than an automatic fit.
  // A chosen zoom survives switching between the Label and Roll views; only
  // a new document, or pressing Fit, hands control back to the fit.
  const zoomChosen = useRef(false)
  const setZoom = useCallback(
    (next: number) => {
      zoomChosen.current = true
      dispatch({ type: 'zoom', zoom: clampZoom(next) })
    },
    [dispatch],
  )

  const zoomBy = useCallback(
    (factor: number) => setZoom(state.zoom * factor),
    [setZoom, state.zoom],
  )

  /** The largest zoom at which the whole strip fits beside the rulers. */
  const zoomToFit = useCallback(() => {
    const availableWidth = viewport.width - RULER - FIT_MARGIN
    const availableHeight = viewport.height - RULER - FIT_MARGIN
    if (availableWidth <= 0 || availableHeight <= 0) return setZoom(ZOOM_DEFAULT)
    const perMm = dotsPerMm(dpi)
    const fit = Math.min(
      availableWidth / (drawn.width * perMm),
      availableHeight / (drawn.height * perMm),
    )
    setZoom(Math.floor(fit * 100) / 100)
    zoomChosen.current = false
  }, [dpi, drawn.height, drawn.width, setZoom, viewport])

  // Fit the strip when the stage first reports a size and whenever a
  // different document arrives. In between, the zoom is the person's own.
  const [fittedFor, setFittedFor] = useState<string | null>(null)
  useEffect(() => {
    if (viewport.width === 0) return
    const key = `${template.id}:${view}`
    if (fittedFor === key) return
    const newDocument = fittedFor === null || !fittedFor.startsWith(`${template.id}:`)
    setFittedFor(key)
    // A new document always fits. A view change refits only while the zoom
    // is still automatic; a zoom the person chose is kept.
    if (newDocument || !zoomChosen.current) zoomToFit()
  }, [fittedFor, template.id, view, viewport.width, zoomToFit])

  // Keyboard shortcuts, scoped so they never fire while a field has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      // While a dialog is up it owns the keyboard: Escape dismisses it and
      // nothing else reaches the designer.
      if (printing || creating) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setPrinting(false)
          setCreating(false)
        }
        // The designer's own shortcuts are still claimed, or a second Ctrl+P
        // falls through to the WebView and opens the browser's print sheet
        // on top of ours.
        if ((event.ctrlKey || event.metaKey) && 'psno'.includes(event.key.toLowerCase())) {
          event.preventDefault()
        }
        return
      }

      // A field being typed in keeps its own undo history.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPrinting(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        startNew()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void open()
        return
      }

      // Zoom shortcuts follow the browser convention, and must be claimed here
      // or the WebView zooms the whole interface instead of the label.
      if (event.ctrlKey || event.metaKey) {
        const zoomKeys: Record<string, () => void> = {
          '=': () => setZoom(stepZoom(zoom, 1)),
          '+': () => setZoom(stepZoom(zoom, 1)),
          '-': () => setZoom(stepZoom(zoom, -1)),
          _: () => setZoom(stepZoom(zoom, -1)),
          '0': zoomToFit,
          '1': () => setZoom(1),
        }
        const run = zoomKeys[event.key]
        if (run) {
          event.preventDefault()
          run()
          return
        }
      }
      if (typing || !state.selectedId) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        dispatch({ type: 'remove', id: state.selectedId })
        return
      }

      // Arrow keys nudge by a whole dot — the smallest move the printer can
      // actually reproduce — or by a millimetre with shift held.
      const dot = 1 / (dpi / 25.4)
      const stepMm = event.shiftKey ? 1 : dot
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-stepMm, 0],
        ArrowRight: [stepMm, 0],
        ArrowUp: [0, -stepMm],
        ArrowDown: [0, stepMm],
      }
      const nudge = nudges[event.key]
      if (!nudge || !selected) return

      event.preventDefault()
      update(selected.id, {
        x: Number((selected.x + nudge[0]).toFixed(3)),
        y: Number((selected.y + nudge[1]).toFixed(3)),
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    creating,
    dispatch,
    dpi,
    open,
    printing,
    save,
    selected,
    setZoom,
    startNew,
    state.selectedId,
    update,
    zoom,
    zoomToFit,
  ])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  const blocked = !canPrint(issues)
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.length - errors

  return (
    <div
      className={`app${sheetOpen ? ' with-sheet' : ''}`}
      style={
        {
          '--sheet-height': `${sheetHeight}px`,
          '--rail-width': `${rail.open ? rail.width : COLLAPSED_WIDTH}px`,
          '--inspector-width': `${inspector.open ? inspector.width : COLLAPSED_WIDTH}px`,
        } as CSSProperties
      }
    >
      <header className="toolbar">
        <span className="brand">
          <span className="brand-mark">
            <LabelMarkIcon />
          </span>
          lblr
        </span>
        <input
          className="doc-name"
          value={template.name}
          aria-label="Label name"
          onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
        />
        <span className="sep" />

        <button className="btn" onClick={startNew} title="New label (Ctrl+N)">
          <PlusIcon />
          New
        </button>
        <button className="btn" onClick={open} title="Open a label (Ctrl+O)">
          <FolderIcon />
          Open
        </button>
        <button className="btn" onClick={save} title="Save (Ctrl+S)">
          <SaveIcon />
          Save{state.dirty ? ' •' : ''}
        </button>
        <span className="sep" />
        <button
          className="btn btn-ghost"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={state.past.length === 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => dispatch({ type: 'redo' })}
          disabled={state.future.length === 0}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
        <span className="sep" />

        <div className="segments" role="group" aria-label="Printer language">
          {(['tspl', 'zpl'] as const).map((item) => (
            <button
              key={item}
              aria-pressed={language === item}
              onClick={() => dispatch({ type: 'language', language: item })}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>

        <select
          value={dpi}
          aria-label="Printer resolution"
          onChange={(event) => dispatch({ type: 'dpi', dpi: Number(event.target.value) })}
        >
          {DPI_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} dpi
            </option>
          ))}
        </select>

        {/* The data control: the tick switches the design between the sheet
            and the sample values; the label opens the sheet itself. */}
        <div className={`data-control${dataOn ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={useData}
            disabled={records.length === 0}
            aria-label="Design with data"
            title={
              records.length === 0
                ? 'Add rows to the data sheet first'
                : useData
                  ? 'Using the data sheet. Untick to design with the sample values.'
                  : 'Using the sample values. Tick to design with the data sheet.'
            }
            onChange={(event) => dispatch({ type: 'useData', on: event.target.checked })}
          />
          <button
            className="btn"
            onClick={() => setSheetOpen((open) => !open)}
            aria-pressed={sheetOpen}
            title="Open the rows to print, one per label"
          >
            Data{records.length > 0 ? ` · ${records.length}` : ''}
          </button>
        </div>

        <span className="spacer" />

        {message ? <span className="hint">{message}</span> : null}

        <button
          className="btn btn-primary"
          onClick={() => setPrinting(true)}
          title="Preview and print (Ctrl+P)"
        >
          <PrintIcon />
          Preview &amp; print
        </button>
      </header>

      <Rail
        template={template}
        selectedId={state.selectedId}
        issues={issues}
        onAdd={addElement}
        onSelect={(id) => dispatch({ type: 'select', id })}
        onToggleHidden={(element) => update(element.id, { hidden: !element.hidden })}
        onToggleLocked={(element) => update(element.id, { locked: !element.locked })}
        onArrange={(id, index) => dispatch({ type: 'arrange', id, index })}
        collapsed={!rail.open}
        onToggle={railControls.toggle}
        edge={
          <PanelEdge
            width={rail.width}
            direction={1}
            min={RAIL_PANEL.min}
            max={RAIL_PANEL.max}
            onWidth={railControls.setWidth}
            onReset={railControls.reset}
            label="Resize the element panel"
          />
        }
      />

      <main className="stage">
        <LabelCanvas
          template={template}
          data={data}
          sequence={canvasSequence}
          view={view}
          dpi={dpi}
          zoom={zoom}
          selectedId={state.selectedId}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onMove={(id, x, y) => update(id, { x, y })}
          onResize={(id, patch) => update(id, patch)}
          onEdit={(id, value) => update(id, { value } as Partial<LabelElement>)}
          onPointer={setPointer}
          onZoomBy={zoomBy}
          onViewport={setViewport}
        />

        <div className="view-toggle segments" role="group" aria-label="Canvas view">
          <button
            aria-pressed={view === 'label'}
            onClick={() => setView('label')}
            title="Just the label being edited"
          >
            Label
          </button>
          <button
            aria-pressed={view === 'roll'}
            onClick={() => setView('roll')}
            title="The whole strip with its neighbours"
          >
            Roll
          </button>
        </div>

        <div className="stage-chip">
          <span>
            {template.media.width} × {template.media.height} mm
            {across > 1 ? `, ${across} across` : ''}
          </span>
          <span className="sep" />
          <span>
            {across > 1 ? `${across} labels` : 'one label'} per pass, {pass.width} × {pass.height}{' '}
            mm
          </span>
        </div>

        <div className="zoom">
          <button
            className="btn btn-ghost"
            onClick={() => setZoom(stepZoom(zoom, -1))}
            aria-label="Zoom out"
            title="Zoom out (Ctrl+−)"
          >
            −
          </button>
          <button
            className="btn btn-ghost measure"
            onClick={() => setZoom(1)}
            title="One screen pixel per printer dot (Ctrl+1)"
          >
            {formatZoom(zoom)}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setZoom(stepZoom(zoom, 1))}
            aria-label="Zoom in"
            title="Zoom in (Ctrl+=)"
          >
            +
          </button>
          <button
            className="btn btn-ghost"
            onClick={zoomToFit}
            title="Fit the roll to the window (Ctrl+0)"
          >
            Fit
          </button>
        </div>
      </main>

      <Inspector
        template={template}
        selected={selected}
        issues={issues}
        fields={fields}
        sample={sample}
        onUpdate={update}
        onRemove={(id) => dispatch({ type: 'remove', id })}
        onReorder={(id, direction) => dispatch({ type: 'reorder', id, direction })}
        onMedia={(patch) => dispatch({ type: 'media', patch })}
        onDefaults={(patch) => dispatch({ type: 'defaults', patch })}
        onSample={(field, value) => dispatch({ type: 'sample', field, value })}
        onSelectIssue={(id) => dispatch({ type: 'select', id })}
        collapsed={!inspector.open}
        onToggle={inspectorControls.toggle}
        edge={
          <PanelEdge
            width={inspector.width}
            direction={-1}
            min={INSPECTOR_PANEL.min}
            max={INSPECTOR_PANEL.max}
            onWidth={inspectorControls.setWidth}
            onReset={inspectorControls.reset}
            label="Resize the properties panel"
          />
        }
      />

      {sheetOpen ? (
        <DataSheet
          fields={fields}
          records={records}
          selectedRows={selectedRows}
          previewRow={activeRow}
          onToggleRow={(row) => dispatch({ type: 'toggleRow', row })}
          onSelectAll={(all) => dispatch({ type: 'selectRows', all })}
          onSelectSome={(rows, on) => dispatch({ type: 'selectSome', rows, on })}
          rowCounts={rowCounts}
          useData={useData}
          onUseData={(on) => dispatch({ type: 'useData', on })}
          onRowCount={(row, count) => dispatch({ type: 'rowCount', row, count })}
          onCell={(row, field, value) => dispatch({ type: 'cell', row, field, value })}
          onAddRow={() => dispatch({ type: 'addRow' })}
          onRemoveRow={(row) => dispatch({ type: 'removeRow', row })}
          onReplace={(next) => dispatch({ type: 'records', records: next })}
          onPreviewRow={(row) => dispatch({ type: 'previewRow', row })}
          height={sheetHeight}
          onHeight={(height) =>
            setSheetHeight(Math.max(MIN_SHEET_HEIGHT, Math.min(window.innerHeight - 260, height)))
          }
          onClose={() => setSheetOpen(false)}
        />
      ) : null}

      <footer className="status">
        <span className="measure">
          {template.media.width} × {template.media.height} mm ·{' '}
          {mmToDots(template.media.width, dpi)} × {mmToDots(template.media.height, dpi)} dots
        </span>
        <span className="sep" />
        <span className="measure">
          {pointer
            ? `${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)} mm · ${mmToDots(
                pointer.x,
                dpi,
              )}, ${mmToDots(pointer.y, dpi)} dots`
            : '—'}
        </span>
        <span className="spacer" />
        {fields.length > 0 ? (
          <span className="measure">
            {fields.length} field{fields.length === 1 ? '' : 's'}: {fields.join(', ')}
          </span>
        ) : null}
        <span className="sep" />
        <span
          className="measure"
          style={{
            color: errors ? 'var(--error)' : warnings ? 'var(--warning)' : 'var(--ok)',
          }}
        >
          {errors ? `${errors} error${errors === 1 ? '' : 's'}` : null}
          {errors && warnings ? ' · ' : null}
          {warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : null}
          {!errors && !warnings ? 'ready to print' : null}
        </span>
      </footer>

      {printing ? (
        <PrintDialog
          jobName={template.name}
          commands={job.commands}
          warnings={job.warnings}
          blocked={blocked}
          template={template}
          data={data}
          records={selectedRecords}
          totalRows={records.length}
          selectedRowCount={selectedRowCount}
          preferSheet={dataOn}
          batch={batch}
          dpi={dpi}
          language={language}
          textScale={textScale}
          onTextScale={(scale) => dispatch({ type: 'textScale', language, scale })}
          layout={template.defaults.layout ?? {}}
          onLayout={(layout) => dispatch({ type: 'defaults', patch: { layout } })}
          copies={template.defaults.copies}
          onCopies={(copies) => dispatch({ type: 'defaults', patch: { copies } })}
          onDefaults={(patch) => dispatch({ type: 'defaults', patch })}
          onClose={() => setPrinting(false)}
        />
      ) : null}

      {creating ? <NewLabelDialog onCreate={createNew} onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
