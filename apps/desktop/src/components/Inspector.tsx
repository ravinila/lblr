/**
 * Properties for the selected element, plus the media the label is printed on.
 *
 * Every numeric field is millimetres, and the number input steps in 0.1 mm.
 * Dragging on the canvas snaps to whole dots; typing here deliberately does
 * not, because sometimes you know the value you want and the validator is the
 * right place to tell you it will round.
 */

import type {
  LabelElement,
  LabelTemplate,
  LinearSymbology,
  MediaSpec,
  PrintDefaults,
  Rotation,
  ValidationIssue,
} from '@lblr/core'

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

function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        {...(min === undefined ? {} : { min })}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

export interface InspectorProps {
  template: LabelTemplate
  selected: LabelElement | null
  issues: ValidationIssue[]
  onUpdate: (id: string, patch: Partial<LabelElement>) => void
  onRemove: (id: string) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
  onMedia: (patch: Partial<MediaSpec>) => void
  onDefaults: (patch: Partial<PrintDefaults>) => void
  onSelectIssue: (elementId: string) => void
}

export function Inspector({
  template,
  selected,
  issues,
  onUpdate,
  onRemove,
  onReorder,
  onMedia,
  onDefaults,
  onSelectIssue,
}: InspectorProps) {
  const patch = (values: Partial<LabelElement>) => {
    if (selected) onUpdate(selected.id, values)
  }

  return (
    <aside className="inspector">
      {selected ? (
        <>
          <section className="panel">
            <h2>{selected.type}</h2>
            <div className="grid-2">
              <Num label="x" value={selected.x} onChange={(x) => patch({ x })} />
              <Num label="y" value={selected.y} onChange={(y) => patch({ y })} />
            </div>
            <label className="field">
              <span>Rotation</span>
              <select
                value={selected.rotation ?? 0}
                onChange={(event) =>
                  patch({ rotation: Number(event.target.value) as Rotation })
                }
              >
                {ROTATIONS.map((rotation) => (
                  <option key={rotation} value={rotation}>
                    {rotation}°
                  </option>
                ))}
              </select>
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
                  onChange={(event) => patch({ value: event.target.value })}
                />
                <Num
                  label="Cap height"
                  value={selected.fontSize}
                  onChange={(fontSize) => patch({ fontSize })}
                  min={0.1}
                />
                <label className="field">
                  <span>Bold</span>
                  <input
                    type="checkbox"
                    checked={selected.bold ?? false}
                    onChange={(event) => patch({ bold: event.target.checked })}
                  />
                </label>
                <Num
                  label="Wrap width"
                  value={selected.maxWidth ?? 0}
                  onChange={(maxWidth) => patch({ maxWidth: maxWidth || undefined })}
                  min={0}
                />
                {selected.maxWidth ? (
                  <label className="field">
                    <span>Align</span>
                    <select
                      value={selected.align ?? 'left'}
                      onChange={(event) =>
                        patch({ align: event.target.value as 'left' | 'center' | 'right' })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
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
                    onChange={(event) => patch({ value: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Symbology</span>
                  <select
                    value={selected.symbology}
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
                <label className="field">
                  <span>Show value</span>
                  <input
                    type="checkbox"
                    checked={selected.humanReadable ?? false}
                    onChange={(event) => patch({ humanReadable: event.target.checked })}
                  />
                </label>
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
                  <select
                    value={selected.errorCorrection ?? 'M'}
                    onChange={(event) =>
                      patch({ errorCorrection: event.target.value as 'L' | 'M' | 'Q' | 'H' })
                    }
                  >
                    <option value="L">L — 7%</option>
                    <option value="M">M — 15%</option>
                    <option value="Q">Q — 25%</option>
                    <option value="H">H — 30%</option>
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {selected.type === 'box' ? (
            <section className="panel">
              <h2>Box</h2>
              <div className="grid-2">
                <Num label="Width" value={selected.width} onChange={(width) => patch({ width })} />
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
              <label className="field">
                <span>Filled</span>
                <input
                  type="checkbox"
                  checked={selected.filled ?? false}
                  onChange={(event) => patch({ filled: event.target.checked })}
                />
              </label>
            </section>
          ) : null}

          {selected.type === 'line' ? (
            <section className="panel">
              <h2>Line</h2>
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
            </section>
          ) : null}

          <section className="panel">
            <div className="add-grid">
              <button className="btn" onClick={() => onReorder(selected.id, 'up')}>
                Bring forward
              </button>
              <button className="btn" onClick={() => onReorder(selected.id, 'down')}>
                Send back
              </button>
            </div>
            <div style={{ marginTop: 6 }}>
              <button className="btn" onClick={() => onRemove(selected.id)}>
                Delete element
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <h2>Media</h2>
            <div className="grid-2">
              <Num
                label="Width"
                value={template.media.width}
                onChange={(width) => onMedia({ width })}
                min={1}
              />
              <Num
                label="Height"
                value={template.media.height}
                onChange={(height) => onMedia({ height })}
                min={1}
              />
            </div>
            <Num
              label="Gap"
              value={template.media.gap}
              onChange={(gap) => onMedia({ gap })}
              min={0}
            />
            <label className="field">
              <span>Stock</span>
              <select
                value={template.media.type}
                onChange={(event) => onMedia({ type: event.target.value as MediaSpec['type'] })}
              >
                <option value="gap">Die-cut with gap</option>
                <option value="blackmark">Black mark</option>
                <option value="continuous">Continuous</option>
              </select>
            </label>
          </section>

          <section className="panel">
            <h2>Print defaults</h2>
            <Num
              label="Darkness"
              value={template.defaults.darkness}
              onChange={(darkness) => onDefaults({ darkness })}
              step={1}
              min={0}
            />
            <Num
              label="Speed (ips)"
              value={template.defaults.speed}
              onChange={(speed) => onDefaults({ speed })}
              step={1}
              min={1}
            />
            <Num
              label="Copies"
              value={template.defaults.copies}
              onChange={(copies) => onDefaults({ copies })}
              step={1}
              min={1}
            />
          </section>
        </>
      )}

      <section className="panel">
        <h2>Checks</h2>
        {issues.length === 0 ? (
          <p className="empty">Nothing to flag. This label will print as drawn.</p>
        ) : (
          <div>
            {issues.map((issue, index) => (
              <div
                key={`${issue.code}:${index}`}
                className="issue"
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
                <span
                  className={issue.severity === 'error' ? 'issue-error' : 'issue-warning'}
                  aria-hidden="true"
                >
                  {issue.severity === 'error' ? '✕' : '!'}
                </span>
                <span>
                  <p>{issue.message}</p>
                  <code>{issue.code}</code>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}
