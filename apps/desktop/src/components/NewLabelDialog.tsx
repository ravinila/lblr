/**
 * Starting a label: the roll in the printer, then a design to begin from.
 *
 * Nobody measures a blank label with a ruler; they read the size off the
 * roll. So the first questions are the ones printed on the box: how big is
 * one label, how many sit across the strip, and what separates them. The
 * designs on the right redraw themselves for whatever size is chosen, so
 * what is picked is what appears.
 */

import { useMemo, useState } from 'react'
import {
  LABEL_PRESETS,
  createTemplate,
  designsFor,
  type LabelDesign,
  type MediaSpec,
} from '@lblr/core'

import { CloseIcon } from './icons.js'
import { PrintPreview } from './PrintPreview.js'

export interface NewLabelSpec {
  name: string
  width: number
  height: number
  gap: number
  columns: number
  columnGap: number
  mediaType: MediaSpec['type']
  /** Id of the starter design, from the gallery. */
  design: string
}

export interface NewLabelDialogProps {
  onCreate: (spec: NewLabelSpec) => void
  onClose: () => void
}

const CUSTOM = 'custom'
const ONE_UP = { columns: 1, rows: 1, columnGap: 0, rowGap: 0 }

export function RollSketch({ columns, height }: { columns: number; height?: number }) {
  const count = Math.min(8, Math.max(1, columns))
  return (
    <div className="roll-sketch" aria-hidden="true" style={{ height: height ?? 44 }}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  )
}

/** One card in the gallery: a live thumbnail of the design at this size. */
function DesignCard({
  design,
  size,
  selected,
  onSelect,
}: {
  design: LabelDesign
  size: { width: number; height: number }
  selected: boolean
  onSelect: () => void
}) {
  const template = useMemo(
    () =>
      createTemplate({
        name: design.name,
        width: size.width,
        height: size.height,
        elements: design.build(size),
      }),
    [design, size],
  )
  return (
    <button className="design-card" aria-pressed={selected} onClick={onSelect}>
      <PrintPreview
        template={template}
        data={design.sample}
        dpi={203}
        layout={ONE_UP}
        maxHeight={96}
      />
      <span className="design-name">{design.name}</span>
      <span className="design-note">{design.note}</span>
    </button>
  )
}

export function NewLabelDialog({ onCreate, onClose }: NewLabelDialogProps) {
  const [presetId, setPresetId] = useState<string>('50x25')
  const [name, setName] = useState('Untitled label')
  const [width, setWidth] = useState(50)
  const [height, setHeight] = useState(25)
  const [gap, setGap] = useState(2)
  const [columns, setColumns] = useState(1)
  const [columnGap, setColumnGap] = useState(2)
  const [mediaType, setMediaType] = useState<MediaSpec['type']>('gap')
  const [design, setDesign] = useState('product')

  const custom = presetId === CUSTOM

  const choose = (id: string) => {
    setPresetId(id)
    const chosen = LABEL_PRESETS.find((item) => item.id === id)
    if (chosen) {
      setWidth(chosen.width)
      setHeight(chosen.height)
      setGap(chosen.gap)
      setColumnGap(chosen.gap)
    }
  }

  const valid = width > 0 && height > 0 && gap >= 0 && columns >= 1 && columnGap >= 0
  const webWidth = width * columns + columnGap * (columns - 1)

  // Only designs that fit this size, and if the chosen one no longer fits,
  // the first one that does.
  const size = useMemo(() => ({ width, height }), [width, height])
  const designs = designsFor(size)
  const chosenDesign = designs.some((item) => item.id === design)
    ? design
    : (designs[0]?.id ?? 'blank')

  const create = () => {
    if (!valid) return
    onCreate({
      name: name.trim() || 'Untitled label',
      width,
      height,
      gap: mediaType === 'continuous' ? 0 : gap,
      columns,
      columnGap,
      mediaType,
      design: chosenDesign,
    })
  }

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="New label"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog dialog-wide">
        <header>
          <h2>New label</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="body">
          <div className="new-label">
            <div className="stack">
              <label className="field">
                <span>Name</span>
                <input
                  value={name}
                  autoFocus
                  style={{ width: 200 }}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') create()
                  }}
                />
              </label>

              <label className="field">
                <span>Label size</span>
                <select
                  value={presetId}
                  style={{ width: 200 }}
                  onChange={(event) => choose(event.target.value)}
                >
                  {LABEL_PRESETS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.note ? ` — ${item.note}` : ''}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom size…</option>
                </select>
              </label>

              <div className="grid-2">
                <label className="field">
                  <span>Width</span>
                  <input
                    type="number"
                    value={width}
                    step={0.1}
                    min={1}
                    readOnly={!custom}
                    onChange={(event) => setWidth(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Height</span>
                  <input
                    type="number"
                    value={height}
                    step={0.1}
                    min={1}
                    readOnly={!custom}
                    onChange={(event) => setHeight(Number(event.target.value))}
                  />
                </label>
              </div>

              <RollSketch columns={columns} />

              <div className="grid-2">
                <label className="field">
                  <span>Labels across</span>
                  <input
                    type="number"
                    value={columns}
                    step={1}
                    min={1}
                    max={8}
                    onChange={(event) =>
                      setColumns(
                        Math.max(1, Math.min(8, Math.floor(Number(event.target.value) || 1))),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Between columns</span>
                  <input
                    type="number"
                    value={columnGap}
                    step={0.1}
                    min={0}
                    disabled={columns <= 1}
                    onChange={(event) => setColumnGap(Math.max(0, Number(event.target.value)))}
                  />
                </label>
              </div>

              <div className="grid-2">
                <label className="field">
                  <span>Stock</span>
                  <select
                    value={mediaType}
                    onChange={(event) => setMediaType(event.target.value as MediaSpec['type'])}
                  >
                    <option value="gap">Die-cut, gap between rows</option>
                    <option value="blackmark">Black mark</option>
                    <option value="continuous">Continuous, no gap</option>
                  </select>
                </label>
                <label className="field">
                  <span>{mediaType === 'blackmark' ? 'Mark' : 'Between rows'}</span>
                  <input
                    type="number"
                    value={mediaType === 'continuous' ? 0 : gap}
                    step={0.1}
                    min={0}
                    disabled={mediaType === 'continuous'}
                    onChange={(event) => setGap(Math.max(0, Number(event.target.value)))}
                  />
                </label>
              </div>

              <p className="note">
                {columns > 1
                  ? `Each pass prints ${columns} labels across a ${Math.round(webWidth * 10) / 10} mm wide strip.`
                  : 'One label per pass. Everything is in millimetres and can be changed later under Label & roll.'}
              </p>
            </div>

            <div>
              <p className="note" style={{ marginBottom: 8 }}>
                <strong>Start from</strong>
                <span className="hint">
                  {' '}
                  · designs that fit {width} × {height} mm
                </span>
              </p>
              <div className="design-grid">
                {designs.map((item) => (
                  <DesignCard
                    key={item.id}
                    design={item}
                    size={size}
                    selected={item.id === chosenDesign}
                    onSelect={() => setDesign(item.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer>
          <span className="status-line" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create} disabled={!valid}>
            Create label
          </button>
        </footer>
      </div>
    </div>
  )
}
