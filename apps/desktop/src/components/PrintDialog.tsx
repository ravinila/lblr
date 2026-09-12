/**
 * Look first, then send.
 *
 * The dialog opens on a picture of exactly what one pass will put on the
 * roll, with the numbers that describe it beside the picture. The compiled
 * command stream is still one click away: when a label comes out wrong the
 * first question is always what was actually sent.
 */

import { useEffect, useState } from 'react'
import {
  isUnscaled,
  layoutSize,
  resolveLayout,
  textCalibrationSpec,
  textScaleFromMeasurement,
  type DataRecord,
  type LabelTemplate,
  type PrintDefaults,
  type PrintLayout,
  type TextScale,
} from '@lblr/core'
import {
  compileMaintenance as maintenanceTspl,
  compileTextCalibration as calibrationTspl,
  type MaintenanceAction,
} from '@lblr/tspl'
import {
  compileMaintenance as maintenanceZpl,
  compileTextCalibration as calibrationZpl,
} from '@lblr/zpl'

import {
  defaultPrinter,
  isDesktop,
  listPrinters,
  printJob,
  probeNetworkPrinter,
  type Destination,
  type PrinterInfo,
} from '../lib/backend.js'
import { CloseIcon, PrintIcon } from './icons.js'
import { PrintPreview } from './PrintPreview.js'

type Target = 'printer' | 'network' | 'file'

/** The widest image a 4-inch desktop printer can burn, in millimetres. */
const MAX_HEAD_WIDTH = 104

export interface PrintDialogProps {
  jobName: string
  commands: string
  warnings: string[]
  blocked: boolean
  template: LabelTemplate
  data: DataRecord
  /** The data sheet, and the whole sheet compiled as one job when it has rows. */
  records: DataRecord[]
  /** Rows in the sheet, ticked or not, so the switch can say "3 of 12". */
  totalRows: number
  batch: { commands: string; warnings: string[] } | null
  dpi: number
  language: 'tspl' | 'zpl'
  /** The font correction measured for this printer language. */
  textScale: TextScale
  onTextScale: (scale: TextScale) => void
  /** Rows per pass and the gap between them; columns come from the roll. */
  layout: PrintLayout
  onLayout: (layout: PrintLayout) => void
  copies: number
  onCopies: (copies: number) => void
  onDefaults: (patch: Partial<PrintDefaults>) => void
  onClose: () => void
}

export function PrintDialog({
  jobName,
  commands,
  warnings,
  blocked,
  template,
  data,
  records,
  totalRows,
  batch,
  dpi,
  language,
  textScale,
  onTextScale,
  layout,
  onLayout,
  copies,
  onCopies,
  onDefaults,
  onClose,
}: PrintDialogProps) {
  const { media } = template
  const [target, setTarget] = useState<Target>('printer')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState('')
  const [host, setHost] = useState('192.168.1.50')
  const [port, setPort] = useState(9100)
  const [path, setPath] = useState('label.prn')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Print the sample label once, or every row of the sheet. */
  const [source, setSource] = useState<'sample' | 'sheet'>(batch ? 'sheet' : 'sample')
  const fromSheet = source === 'sheet' && batch !== null
  const jobCommands = fromSheet ? batch.commands : commands
  const jobWarnings = fromSheet ? batch.warnings : warnings
  const previewData = fromSheet ? (records[0] ?? data) : data
  /** How far the Back and Forward buttons move the paper, in millimetres. */
  const [moveBy, setMoveBy] = useState(5)
  /** The text size check: printed, and waiting for the ruler. */
  const [measuring, setMeasuring] = useState(false)
  const [measuredHeight, setMeasuredHeight] = useState('')
  const [measuredWidth, setMeasuredWidth] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const [found, fallback] = await Promise.all([listPrinters(), defaultPrinter()])
        if (!live) return
        setPrinters(found)
        setPrinter(fallback ?? found[0]?.name ?? '')
      } catch (error) {
        if (live) setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const destination = (): Destination => {
    switch (target) {
      case 'printer':
        return { kind: 'printer', name: printer }
      case 'network':
        return { kind: 'network', host, port }
      case 'file':
        return { kind: 'file', path }
    }
  }

  const resolved = resolveLayout(template)
  const perPass = layoutSize(media, resolved)
  const cells = resolved.columns * resolved.rows
  const passes = fromSheet ? Math.ceil(records.length / cells) : 1
  const total = (fromSheet ? records.length : cells) * Math.max(1, copies)

  const send = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await printJob(destination(), jobCommands, jobName)
      setStatus(
        target === 'file'
          ? `Written to ${path}`
          : `Sent ${total} label${total === 1 ? '' : 's'} to the printer`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  /** Calibrate the sensor to this roll, or feed one label of it. */
  const maintain = async (action: MaintenanceAction) => {
    const compileMaintenance = language === 'tspl' ? maintenanceTspl : maintenanceZpl
    setBusy(true)
    setStatus(null)
    try {
      const commands = compileMaintenance(template, action, { dpi, distance: moveBy })
      await printJob(destination(), commands, `lblr ${action}`)
      setStatus(
        {
          feed: 'Sent a feed. The printer should advance one label.',
          calibrate:
            'Sent a calibration. The printer feeds a few labels while it measures the gap.',
          forward: `Moved the paper ${moveBy} mm forward.`,
          backward: `Moved the paper ${moveBy} mm back.`,
        }[action],
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const spec = textCalibrationSpec(template.media)

  /** Print the size check with no correction, then wait for the measurements. */
  const printSizeCheck = async () => {
    const compileCalibration = language === 'tspl' ? calibrationTspl : calibrationZpl
    setBusy(true)
    setStatus(null)
    try {
      await printJob(destination(), compileCalibration(template, { dpi }), 'lblr text size check')
      setMeasuring(true)
      setMeasuredHeight('')
      setMeasuredWidth('')
      setStatus('Printed the size check. Measure the digits and enter what you see.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const applyMeasurement = () => {
    const height = Number(measuredHeight)
    const width = Number(measuredWidth)
    if (!(height > 0) || !(width > 0)) return
    onTextScale(textScaleFromMeasurement(spec, height, width))
    setMeasuring(false)
    setStatus('Text correction saved for this printer.')
  }

  const test = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const reachable = await probeNetworkPrinter(host, port)
      setStatus(
        reachable
          ? `${host}:${port} is listening`
          : `Nothing answered on ${host}:${port}. Check the printer is on and on this network.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const succeeded = status !== null && /^Sent|^Written|listening$/.test(status)
  const continuous = media.type === 'continuous'
  const tearOffset = template.defaults.tearOffset ?? 0
  const across = resolved.columns
  const stockLine =
    across > 1
      ? `${media.width} × ${media.height} mm, ${across} across`
      : `${media.width} × ${media.height} mm`

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Print"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog dialog-wide">
        <header>
          <h2>Print {jobName}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="body">
          <div className="print-layout">
            <div>
              {batch ? (
                <div
                  className="segments"
                  role="group"
                  aria-label="What to print"
                  style={{ marginBottom: 10 }}
                >
                  <button aria-pressed={source === 'sample'} onClick={() => setSource('sample')}>
                    Sample values
                  </button>
                  <button aria-pressed={source === 'sheet'} onClick={() => setSource('sheet')}>
                    Data sheet ·{' '}
                    {records.length < totalRows
                      ? `${records.length} of ${totalRows} rows`
                      : `${records.length} row${records.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              ) : null}
              <PrintPreview template={template} data={previewData} dpi={dpi} layout={resolved} />
              <div className="print-summary">
                <span>
                  <strong>
                    {fromSheet
                      ? `${records.length} label${records.length === 1 ? '' : 's'} in ${passes} pass${passes === 1 ? '' : 'es'}`
                      : `${cells} label${cells === 1 ? '' : 's'} per pass`}
                  </strong>
                  <span className="hint"> on {stockLine}</span>
                </span>
                <span className="measure hint">
                  {perPass.width} × {perPass.height} mm
                </span>
              </div>

              <div className="grid-2" style={{ marginTop: 12 }}>
                <label className="field">
                  <span>Rows per pass</span>
                  <input
                    type="number"
                    value={resolved.rows}
                    min={1}
                    max={12}
                    step={1}
                    style={{ width: 72 }}
                    onChange={(event) =>
                      onLayout({
                        ...layout,
                        rows: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Passes</span>
                  <input
                    type="number"
                    value={copies}
                    min={1}
                    step={1}
                    style={{ width: 72 }}
                    onChange={(event) =>
                      onCopies(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                    }
                  />
                </label>
              </div>

              {resolved.rows > 1 ? (
                <p className="note" style={{ marginTop: 8 }}>
                  {resolved.rows} rows print as one {perPass.height} mm tall label, so the printer
                  only looks for a gap after the last row. Use it on continuous stock or when the
                  printer keeps stopping between rows.
                </p>
              ) : null}

              {jobWarnings.length > 0 ? (
                <p className="note" style={{ marginTop: 8 }}>
                  {jobWarnings.length === 1
                    ? jobWarnings[0]
                    : `${jobWarnings.length} things were approximated while compiling. See the printer commands.`}
                </p>
              ) : null}

              <details className="disclosure" style={{ marginTop: 12 }}>
                <summary>Printer commands</summary>
                <pre className="code">{jobCommands}</pre>
              </details>
            </div>

            <div className="stack">
              <label className="field">
                <span>Send to</span>
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value as Target)}
                >
                  <option value="printer">A printer on this computer</option>
                  <option value="network">A printer on the network</option>
                  <option value="file">A file</option>
                </select>
              </label>

              {target === 'printer' ? (
                <label className="field">
                  <span>Printer</span>
                  <select value={printer} onChange={(event) => setPrinter(event.target.value)}>
                    {printers.length === 0 ? <option value="">No printers found</option> : null}
                    {printers.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                        {item.status && item.status !== 'ready' ? ` — ${item.status}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {target === 'network' ? (
                <>
                  <label className="field">
                    <span>Address</span>
                    <input value={host} onChange={(event) => setHost(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Port</span>
                    <input
                      type="number"
                      value={port}
                      onChange={(event) => setPort(Number(event.target.value) || 9100)}
                    />
                  </label>
                  <div>
                    <button className="btn" onClick={test} disabled={busy}>
                      Test connection
                    </button>
                  </div>
                </>
              ) : null}

              {target === 'file' ? (
                <label className="field">
                  <span>File</span>
                  <input value={path} onChange={(event) => setPath(event.target.value)} />
                </label>
              ) : null}

              {!isDesktop() ? (
                <p className="note">
                  This is the browser preview, so nothing can reach a printer. Run the desktop app
                  to print.
                </p>
              ) : null}

              <div className="stack" style={{ marginTop: 10 }}>
                <p className="note">
                  <strong>Printer setup</strong>
                </p>
                <label className="field">
                  <span>Stops after print</span>
                  <input
                    type="number"
                    value={tearOffset}
                    step={0.5}
                    style={{ width: 96 }}
                    onChange={(event) =>
                      onDefaults({ tearOffset: Number(event.target.value) || undefined })
                    }
                  />
                </label>
                <p className="note">
                  Millimetres past the tear bar. Raise it if labels stop short of the tear edge,
                  lower it if they overshoot. Negative holds the label back.
                </p>
                <div className="grid-2">
                  <button
                    className="btn"
                    onClick={() => maintain('calibrate')}
                    disabled={busy || continuous || target === 'file'}
                    title={
                      continuous
                        ? 'Continuous stock has no gaps or marks to measure'
                        : 'Measure the gap so every print starts on a label edge'
                    }
                  >
                    Calibrate
                  </button>
                  <button
                    className="btn"
                    onClick={() => maintain('feed')}
                    disabled={busy || target === 'file'}
                    title="Advance one label"
                  >
                    Feed one label
                  </button>
                </div>
                <label className="field">
                  <span>Move paper by</span>
                  <input
                    type="number"
                    value={moveBy}
                    min={0.5}
                    max={300}
                    step={0.5}
                    style={{ width: 96 }}
                    onChange={(event) =>
                      setMoveBy(Math.min(300, Math.max(0.5, Number(event.target.value) || 0.5)))
                    }
                  />
                </label>
                <div className="grid-2">
                  <button
                    className="btn"
                    onClick={() => maintain('backward')}
                    disabled={busy || target === 'file' || language !== 'tspl'}
                    title={
                      language === 'tspl'
                        ? `Pull the paper back ${moveBy} mm`
                        : 'ZPL printers cannot move the paper backward on command'
                    }
                  >
                    ◀ Back {moveBy} mm
                  </button>
                  <button
                    className="btn"
                    onClick={() => maintain('forward')}
                    disabled={busy || target === 'file'}
                    title={`Move the paper forward ${moveBy} mm`}
                  >
                    Forward {moveBy} mm ▶
                  </button>
                </div>
                <p className="note">
                  {continuous
                    ? 'This roll has no gaps, so the printer cannot find a label edge. Line the paper up by hand and use Shift Y under Printer settings to move the print.'
                    : 'Calibrate after loading a new roll, or when prints creep further off with each label. A blinking light afterwards means the printer could not find a gap: if the roll has none, set Stock to continuous, then press FEED on the printer to clear the error.'}
                </p>
              </div>

              <div className="stack" style={{ marginTop: 10 }}>
                <p className="note">
                  <strong>Text size</strong>
                </p>
                <p className="note">
                  {isUnscaled(textScale)
                    ? 'Some printers draw their built-in font larger than asked. Print the size check once per printer and measure it.'
                    : `Corrected: this printer draws text at ${Math.round(100 / textScale.height)}% height and ${Math.round(100 / textScale.width)}% width, so every text is sent ${Math.round(textScale.height * 100)}% × ${Math.round(textScale.width * 100)}% of its size.`}
                </p>
                {measuring ? (
                  <>
                    <p className="note">
                      The box should measure {spec.boxWidth} × {spec.boxHeight} mm; if it does not,
                      the resolution is wrong, not the text. Then measure the digits.
                    </p>
                    <label className="field">
                      <span>Digit height</span>
                      <input
                        type="number"
                        value={measuredHeight}
                        placeholder={String(spec.capHeight)}
                        step={0.1}
                        min={0.1}
                        style={{ width: 96 }}
                        onChange={(event) => setMeasuredHeight(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Width of all ten digits</span>
                      <input
                        type="number"
                        value={measuredWidth}
                        placeholder={String(spec.expectedWidth)}
                        step={0.1}
                        min={0.1}
                        style={{ width: 96 }}
                        onChange={(event) => setMeasuredWidth(event.target.value)}
                      />
                    </label>
                    <div className="grid-2">
                      <button className="btn" onClick={() => setMeasuring(false)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={applyMeasurement}
                        disabled={!(Number(measuredHeight) > 0 && Number(measuredWidth) > 0)}
                      >
                        Apply
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="grid-2">
                    <button
                      className="btn"
                      onClick={printSizeCheck}
                      disabled={busy || target === 'file'}
                      title="Print a box and a row of digits to measure"
                    >
                      Print size check
                    </button>
                    <button
                      className="btn"
                      onClick={() => onTextScale({ height: 1, width: 1 })}
                      disabled={isUnscaled(textScale)}
                      title="Trust the printer's font size again"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {perPass.width > MAX_HEAD_WIDTH ? (
                <p className="note note-error">
                  One pass is {perPass.width} mm wide, but a 4-inch printer burns at most{' '}
                  {MAX_HEAD_WIDTH} mm. The last column will come out blank or cut off. Check the
                  label width and the gap between columns against the roll.
                </p>
              ) : null}

              <p className="note">
                The printer is told the label is {perPass.width} × {perPass.height} mm and the roll
                is loaded as{' '}
                {media.type === 'continuous'
                  ? 'continuous stock'
                  : `${media.type === 'blackmark' ? 'black-mark' : 'die-cut'} stock with a ${resolved.rowGap} mm gap`}
                . Change that under Label &amp; roll if it does not match what is in the printer.
              </p>
            </div>
          </div>
        </div>

        <footer>
          <span className={`status-line${status ? (succeeded ? ' ok' : ' error') : ''}`}>
            {status ?? ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={send} disabled={busy || blocked}>
            <PrintIcon />
            {blocked
              ? 'Fix errors first'
              : busy
                ? 'Sending…'
                : `Print ${total} label${total === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
