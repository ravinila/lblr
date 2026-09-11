import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  canPrint,
  mmToDots,
  parseTemplate,
  serializeTemplate,
  templateFields,
  validateTemplate,
  type LabelElement,
} from '@lblr/core'
import { compileJob as compileTspl } from '@lblr/tspl'
import { compileJob as compileZpl } from '@lblr/zpl'

import { Inspector } from './components/Inspector.js'
import { LabelCanvas } from './components/LabelCanvas.js'
import { PrintDialog } from './components/PrintDialog.js'
import { Rail } from './components/Rail.js'
import {
  chooseOpenPath,
  chooseSavePath,
  readTextFile,
  writeTextFile,
} from './lib/backend.js'
import { newElement, useDesigner } from './state/designer.js'

const DPI_OPTIONS = [203, 300, 600]

export function App() {
  const { state, dispatch, selected, update } = useDesigner()
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [printing, setPrinting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const { template, dpi, zoom, language, sample } = state

  const issues = useMemo(
    () => validateTemplate(template, { dpi, data: sample }),
    [template, dpi, sample],
  )

  const job = useMemo(() => {
    const compile = language === 'tspl' ? compileTspl : compileZpl
    return compile(template, sample, { dpi })
  }, [template, sample, dpi, language])

  const fields = useMemo(() => templateFields(template), [template])

  const addElement = useCallback(
    (kind: LabelElement['type']) => {
      // Drop new elements a little inside the top-left corner rather than on
      // the media edge, where they would immediately fail the bounds check.
      dispatch({ type: 'add', element: newElement(kind, { x: 3, y: 3 }) })
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

  // Keyboard shortcuts, scoped so they never fire while a field has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
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
  }, [dispatch, dpi, save, selected, state.selectedId, update])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  const blocked = !canPrint(issues)
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.length - errors

  return (
    <div className="app">
      <header className="toolbar">
        <input
          value={template.name}
          aria-label="Template name"
          style={{ width: 180 }}
          onChange={(event) => dispatch({ type: 'rename', name: event.target.value })}
        />
        <span className="sep" />

        <button className="btn" onClick={open}>
          Open
        </button>
        <button className="btn" onClick={save}>
          Save{state.dirty ? ' •' : ''}
        </button>
        <span className="sep" />

        <label className="field">
          <span>Language</span>
          <select
            value={language}
            onChange={(event) =>
              dispatch({ type: 'language', language: event.target.value as 'tspl' | 'zpl' })
            }
          >
            <option value="tspl">TSPL</option>
            <option value="zpl">ZPL</option>
          </select>
        </label>

        <label className="field">
          <span>Resolution</span>
          <select value={dpi} onChange={(event) => dispatch({ type: 'dpi', dpi: Number(event.target.value) })}>
            {DPI_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} dpi
              </option>
            ))}
          </select>
        </label>

        <span className="spacer" />

        {message ? <span className="measure">{message}</span> : null}

        <button className="btn btn-primary" onClick={() => setPrinting(true)}>
          Print
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
      />

      <main className="stage">
        <LabelCanvas
          template={template}
          data={sample}
          dpi={dpi}
          zoom={zoom}
          selectedId={state.selectedId}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onMove={(id, x, y) => update(id, { x, y })}
          onPointer={setPointer}
        />

        <div className="zoom">
          <button
            className="btn btn-ghost"
            onClick={() => dispatch({ type: 'zoom', zoom: zoom - 1 })}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="measure">{zoom}× </span>
          <button
            className="btn btn-ghost"
            onClick={() => dispatch({ type: 'zoom', zoom: zoom + 1 })}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </main>

      <Inspector
        template={template}
        selected={selected}
        issues={issues}
        onUpdate={update}
        onRemove={(id) => dispatch({ type: 'remove', id })}
        onReorder={(id, direction) => dispatch({ type: 'reorder', id, direction })}
        onMedia={(patch) => dispatch({ type: 'media', patch })}
        onDefaults={(patch) => dispatch({ type: 'defaults', patch })}
        onSelectIssue={(id) => dispatch({ type: 'select', id })}
      />

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
          style={{ color: errors ? 'var(--error)' : warnings ? 'var(--warning)' : undefined }}
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
          onClose={() => setPrinting(false)}
        />
      ) : null}
    </div>
  )
}
