/**
 * Properties for the selected element, or, with nothing selected, the roll
 * the label is printed on and the values that fill its placeholders.
 *
 * Every numeric field is millimetres, and the number input steps in 0.1 mm.
 * Dragging on the canvas snaps to whole dots; typing here deliberately does
 * not, because sometimes you know the value you want and the validator is the
 * right place to tell you it will round.
 */

import {
  LABEL_PRESETS,
  layoutSize,
  matchPreset,
  stockLayout,
  type LabelElement,
  type LabelTemplate,
  type LinearSymbology,
  type MediaSpec,
  type PrintDefaults,
  type Rotation,
  type ValidationIssue,
} from '@lblr/core'

import type { ReactNode } from 'react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownIcon,
  ErrorIcon,
  TrashIcon,
  UpIcon,
  WarningIcon,
} from './icons.js'
import { RollSketch } from './NewLabelDialog.js'

const SYMBOLOGIES: LinearSymbology[] = [
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upca',
  'upce',
  'itf',
  'itf14',
  'codabar',
  'gs1-128',
  'msi',
]

const ROTATIONS: Rotation[] = [0, 90, 180, 270]

const KIND_NAMES: Record<LabelElement['type'], string> = {
  text: 'Text',
  barcode: 'Barcode',
  qrcode: 'QR code',
  box: 'Box',
  line: 'Line',
  image: 'Image',
}

function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        step={step}
        disabled={disabled}
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export interface InspectorProps {
  template: LabelTemplate
  selected: LabelElement | null
  issues: ValidationIssue[]
  fields: string[]
  sample: Record<string, string>
  onUpdate: (id: string, patch: Partial<LabelElement>) => void
  onRemove: (id: string) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
  onMedia: (patch: Partial<MediaSpec>) => void
  onDefaults: (patch: Partial<PrintDefaults>) => void
  onSample: (field: string, value: string) => void
  onSelectIssue: (elementId: string) => void
  /** Collapsed to a slim strip with just the reopen button. */
  collapsed: boolean
  onToggle: () => void
  /** The draggable edge, rendered by the shell that owns the width. */
  edge: ReactNode
}

export function Inspector({
  template,
  selected,
  issues,
  fields,
  sample,
  onUpdate,
  onRemove,
  onReorder,
  onMedia,
  onDefaults,
  onSample,
  onSelectIssue,
  collapsed,
  onToggle,
  edge,
}: InspectorProps) {
  const patch = (values: Partial<LabelElement>) => {
    if (selected) onUpdate(selected.id, values)
  }

  const { media } = template
  const columns = media.columns ?? 1
  const pass = layoutSize(media, stockLayout(media))

  return (
    <aside className={`inspector side${collapsed ? ' collapsed' : ''}`}>
      <button
        className="icon-btn panel-toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Show the properties panel' : 'Hide the properties panel'}
        title={collapsed ? 'Show the properties panel' : 'Hide the properties panel'}
      >
        {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </button>
      {collapsed ? null : edge}
      {selected ? (
        <>
          <section className="panel">
            <div className="panel-title">
              <h2>{KIND_NAMES[selected.type]}</h2>
              <span className="measure">
                {Number(selected.x.toFixed(2))} , {Number(selected.y.toFixed(2))} mm
              </span>
            </div>
            <div className="grid-2">
              <Num label="X" value={selected.x} onChange={(x) => patch({ x })} />
              <Num label="Y" value={selected.y} onChange={(y) => patch({ y })} />
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              <span>Rotation</span>
              <div className="segments" role="group" aria-label="Rotation">
                {ROTATIONS.map((rotation) => (
                  <button
                    key={rotation}
                    aria-pressed={(selected.rotation ?? 0) === rotation}
                    onClick={() => patch({ rotation })}
                  >
                    {rotation}°
                  </button>
                ))}
              </div>
            </label>
          </section>

          {selected.type === 'text' ? (
            <section className="panel">
              <h2>Text</h2>
              <div className="stack">
                <textarea
                  rows={3}
                  value={selected.value}
                  aria-label="Text content"
                  placeholder="Type text, or {{field}} to fill from data"
                  onChange={(event) => patch({ value: event.target.value })}
                />
                <Num
                  label="Cap height"
                  value={selected.fontSize}
                  onChange={(fontSize) => patch({ fontSize })}
                  min={0.1}
                />
                <Check
                  label="Bold"
                  checked={selected.bold ?? false}
                  onChange={(bold) => patch({ bold })}
                />
                <Num
                  label="Wrap width"
                  value={selected.maxWidth ?? 0}
                  onChange={(maxWidth) => patch({ maxWidth: maxWidth || undefined })}
                  min={0}
                />
                {selected.maxWidth ? (
                  <label className="field">
                    <span>Align</span>
                    <div className="segments" role="group" aria-label="Align">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          key={align}
                          aria-pressed={(selected.align ?? 'left') === align}
                          onClick={() => patch({ align })}
                        >
                          {align[0]?.toUpperCase()}
                          {align.slice(1)}
                        </button>
                      ))}
                    </div>
                  </label>
                ) : null}
              </div>
            </section>
          ) : null}

          {selected.type === 'barcode' ? (
            <section className="panel">
              <h2>Barcode</h2>
              <div className="stack">
                <label className="field">
                  <span>Value</span>
                  <input
                    value={selected.value}
                    style={{ width: 160 }}
                    onChange={(event) => patch({ value: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Symbology</span>
                  <select
                    value={selected.symbology}
                    style={{ width: 160 }}
                    onChange={(event) =>
                      patch({ symbology: event.target.value as LinearSymbology })
                    }
                  >
                    {SYMBOLOGIES.map((symbology) => (
                      <option key={symbology} value={symbology}>
                        {symbology}
                      </option>
                    ))}
                  </select>
                </label>
                <Num
                  label="Bar height"
                  value={selected.height}
                  onChange={(height) => patch({ height })}
                  min={1}
                />
                <Num
                  label="Module width"
                  value={selected.moduleWidth ?? 0.25}
                  onChange={(moduleWidth) => patch({ moduleWidth })}
                  step={0.05}
                  min={0.05}
                />
                <Check
                  label="Show value"
                  checked={selected.humanReadable ?? false}
                  onChange={(humanReadable) => patch({ humanReadable })}
                />
              </div>
            </section>
          ) : null}

          {selected.type === 'qrcode' ? (
            <section className="panel">
              <h2>QR code</h2>
              <div className="stack">
                <label className="field">
                  <span>Value</span>
                  <input
                    value={selected.value}
                    style={{ width: 160 }}
                    onChange={(event) => patch({ value: event.target.value })}
                  />
                </label>
                <Num
                  label="Module"
                  value={selected.moduleWidth}
                  onChange={(moduleWidth) => patch({ moduleWidth })}
                  step={0.05}
                  min={0.05}
                />
                <label className="field">
                  <span>Correction</span>
                  <div className="segments" role="group" aria-label="Error correction">
                    {(['L', 'M', 'Q', 'H'] as const).map((level) => (
                      <button
                        key={level}
                        aria-pressed={(selected.errorCorrection ?? 'M') === level}
                        onClick={() => patch({ errorCorrection: level })}
                        title={{ L: '7% recoverable', M: '15%', Q: '25%', H: '30%' }[level]}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </section>
          ) : null}

          {selected.type === 'box' ? (
            <section className="panel">
              <h2>Box</h2>
              <div className="stack">
                <div className="grid-2">
                  <Num
                    label="Width"
                    value={selected.width}
                    onChange={(width) => patch({ width })}
                  />
                  <Num
                    label="Height"
                    value={selected.height}
                    onChange={(height) => patch({ height })}
                  />
                </div>
                <Num
                  label="Thickness"
                  value={selected.thickness}
                  onChange={(thickness) => patch({ thickness })}
                  step={0.05}
                  min={0.05}
                />
                <Check
                  label="Filled"
                  checked={selected.filled ?? false}
                  onChange={(filled) => patch({ filled })}
                />
              </div>
            </section>
          ) : null}

          {selected.type === 'line' ? (
            <section className="panel">
              <h2>Line</h2>
              <div className="stack">
                <Num
                  label="Length"
                  value={selected.length}
                  onChange={(length) => patch({ length })}
                />
                <Num
                  label="Thickness"
                  value={selected.thickness}
                  onChange={(thickness) => patch({ thickness })}
                  step={0.05}
                  min={0.05}
                />
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="stack">
              <div className="grid-2">
                <button className="btn" onClick={() => onReorder(selected.id, 'up')}>
                  <UpIcon />
                  Forward
                </button>
                <button className="btn" onClick={() => onReorder(selected.id, 'down')}>
                  <DownIcon />
                  Back
                </button>
              </div>
              <button className="btn btn-danger btn-wide" onClick={() => onRemove(selected.id)}>
                <TrashIcon />
                Remove from label
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-title">
              <h2>Label &amp; roll</h2>
              <span className="measure">
                {pass.width} × {pass.height} mm per pass
              </span>
            </div>
            <div className="stack">
              <label className="field">
                <span>Label size</span>
                <select
                  value={matchPreset(media)?.id ?? 'custom'}
                  style={{ width: 150 }}
                  onChange={(event) => {
                    const preset = LABEL_PRESETS.find((item) => item.id === event.target.value)
                    if (preset) {
                      onMedia({ width: preset.width, height: preset.height, gap: preset.gap })
                    }
                  }}
                >
                  {LABEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                  <option value="custom">Custom size</option>
                </select>
              </label>
              <div className="grid-2">
                <Num
                  label="Width"
                  value={media.width}
                  onChange={(width) => onMedia({ width })}
                  min={1}
                />
                <Num
                  label="Height"
                  value={media.height}
                  onChange={(height) => onMedia({ height })}
                  min={1}
                />
              </div>

              <RollSketch columns={columns} height={36} />

              <Num
                label="Labels across"
                value={columns}
                step={1}
                min={1}
                max={8}
                onChange={(value) =>
                  onMedia({ columns: Math.max(1, Math.min(8, Math.floor(value))) })
                }
              />
              <Num
                label="Between columns"
                value={media.columnGap ?? media.gap}
                onChange={(columnGap) => onMedia({ columnGap: Math.max(0, columnGap) })}
                min={0}
                disabled={columns <= 1}
              />
              <label className="field">
                <span>Stock</span>
                <select
                  value={media.type}
                  style={{ width: 150 }}
                  onChange={(event) => onMedia({ type: event.target.value as MediaSpec['type'] })}
                >
                  <option value="gap">Die-cut, gap between rows</option>
                  <option value="blackmark">Black mark</option>
                  <option value="continuous">Continuous, no gap</option>
                </select>
              </label>
              <Num
                label={media.type === 'blackmark' ? 'Mark height' : 'Between rows'}
                value={media.type === 'continuous' ? 0 : media.gap}
                onChange={(gap) => onMedia({ gap: Math.max(0, gap) })}
                min={0}
                disabled={media.type === 'continuous'}
              />
            </div>
          </section>

          {fields.length > 0 ? (
            <section className="panel">
              <h2>Sample values</h2>
              <div className="stack">
                {fields.map((field) => (
                  <label key={field} className="field">
                    <span className="measure">{`{{${field}}}`}</span>
                    <input
                      value={sample[field] ?? ''}
                      style={{ width: 150 }}
                      onChange={(event) => onSample(field, event.target.value)}
                    />
                  </label>
                ))}
                <p className="note">
                  Shown on the canvas and printed as a single label. Open Data in the toolbar to
                  print a row per product instead.
                </p>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <h2>Printer settings</h2>
            <div className="stack">
              <Num
                label="Darkness"
                value={template.defaults.darkness}
                onChange={(darkness) => onDefaults({ darkness })}
                step={1}
                min={0}
                max={15}
              />
              <Num
                label="Speed (in/s)"
                value={template.defaults.speed}
                onChange={(speed) => onDefaults({ speed })}
                step={1}
                min={1}
              />
              <div className="grid-2">
                <Num
                  label="Shift X"
                  value={template.defaults.offsetX ?? 0}
                  onChange={(offsetX) => onDefaults({ offsetX: offsetX || undefined })}
                />
                <Num
                  label="Shift Y"
                  value={template.defaults.offsetY ?? 0}
                  onChange={(offsetY) => onDefaults({ offsetY: offsetY || undefined })}
                />
              </div>
              <p className="note">
                Shift moves everything on the roll, for when the printout lands a little off the
                labels. Negative pulls it left or up. Calibration and the tear-off position are in
                the print dialog.
              </p>
            </div>
          </section>
        </>
      )}

      <section className="panel">
        <h2>Checks</h2>
        {issues.length === 0 ? (
          <p className="ok-line">
            <CheckIcon />
            Prints as drawn
          </p>
        ) : (
          <div>
            {issues.map((issue, index) => (
              <div
                key={`${issue.code}:${index}`}
                className={`issue ${issue.severity === 'error' ? 'issue-error' : 'issue-warning'}`}
                role="button"
                tabIndex={0}
                onClick={() => issue.elementId && onSelectIssue(issue.elementId)}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && issue.elementId) {
                    event.preventDefault()
                    onSelectIssue(issue.elementId)
                  }
                }}
              >
                {issue.severity === 'error' ? <ErrorIcon /> : <WarningIcon />}
                <p>{issue.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}
