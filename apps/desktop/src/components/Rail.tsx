/** Add elements, then manage the stack they form. */

import type { LabelElement, LabelTemplate, ValidationIssue } from '@lblr/core'

import {
  BarcodeIcon,
  BoxIcon,
  EyeIcon,
  EyeOffIcon,
  GripIcon,
  LineIcon,
  LockIcon,
  QrIcon,
  TextIcon,
  UnlockIcon,
  elementIcon,
} from './icons.js'
import { useSortable } from './useSortable.js'

const ADDABLE: Array<{ kind: LabelElement['type']; label: string; icon: JSX.Element }> = [
  { kind: 'text', label: 'Text', icon: <TextIcon /> },
  { kind: 'barcode', label: 'Barcode', icon: <BarcodeIcon /> },
  { kind: 'qrcode', label: 'QR code', icon: <QrIcon /> },
  { kind: 'box', label: 'Box', icon: <BoxIcon /> },
  { kind: 'line', label: 'Line', icon: <LineIcon /> },
]

function describe(element: LabelElement): string {
  switch (element.type) {
    case 'text':
      return element.value || 'Empty text'
    case 'barcode':
      return element.value ? `${element.value}` : 'Empty barcode'
    case 'qrcode':
      return element.value || 'Empty QR code'
    case 'box':
      return `Box ${element.width} × ${element.height} mm`
    case 'line':
      return `Line ${element.length} mm`
    case 'image':
      return `Image ${element.width} × ${element.height} mm`
  }
}

export interface RailProps {
  template: LabelTemplate
  selectedId: string | null
  issues: ValidationIssue[]
  onAdd: (kind: LabelElement['type']) => void
  onSelect: (id: string) => void
  onToggleHidden: (element: LabelElement) => void
  onToggleLocked: (element: LabelElement) => void
  /** A row was dragged to a new position in the top-down list. */
  onArrange: (id: string, index: number) => void
}

export function Rail({
  template,
  selectedId,
  issues,
  onAdd,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onArrange,
}: RailProps) {
  // Later in the array draws on top, so the list reads top-down like the stack.
  const stacked = [...template.elements].reverse()
  const worst = new Map<string, ValidationIssue['severity']>()
  for (const issue of issues) {
    if (!issue.elementId) continue
    if (issue.severity === 'error' || !worst.has(issue.elementId)) {
      worst.set(issue.elementId, issue.severity)
    }
  }

  const sortable = useSortable(stacked.length, (from, to) => {
    const element = stacked[from]
    if (element) onArrange(element.id, to)
  })

  return (
    <aside className="rail">
      <section className="panel">
        <h2>Add to the label</h2>
        <div className="add-list">
          {ADDABLE.map((item) => (
            <button key={item.kind} className="add-item" onClick={() => onAdd(item.kind)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>On the label</h2>
          <span className="measure">{stacked.length || ''}</span>
        </div>
        {stacked.length === 0 ? (
          <p className="empty">Nothing yet. Add text, a barcode or a QR code above.</p>
        ) : (
          <div
            ref={sortable.containerRef}
            className={`layers${sortable.dragging !== null ? ' sorting' : ''}`}
            role="listbox"
            aria-label="Elements, top to bottom"
          >
            {stacked.map((element, index) => {
              const severity = worst.get(element.id)
              const dragging = sortable.dragging === index
              return (
                <div
                  key={element.id}
                  {...sortable.rowProps(index)}
                  className={`layer${dragging ? ' dragging' : ''}`}
                  role="option"
                  tabIndex={0}
                  aria-selected={element.id === selectedId}
                  onClick={() => onSelect(element.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(element.id)
                    }
                  }}
                >
                  <span className="grip" aria-hidden="true">
                    <GripIcon />
                  </span>
                  {elementIcon(element.type)}
                  <span className="layer-name" style={{ opacity: element.hidden ? 0.5 : 1 }}>
                    {element.name ?? describe(element)}
                  </span>
                  {severity ? (
                    <span className={`layer-flag ${severity}`} aria-label={severity} />
                  ) : null}
                  <button
                    className="icon-btn"
                    title={element.hidden ? 'Show on the label' : 'Hide from the label'}
                    aria-label={element.hidden ? 'Show on the label' : 'Hide from the label'}
                    aria-pressed={Boolean(element.hidden)}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleHidden(element)
                    }}
                  >
                    {element.hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  <button
                    className="icon-btn"
                    title={element.locked ? 'Allow dragging' : 'Lock in place'}
                    aria-label={element.locked ? 'Allow dragging' : 'Lock in place'}
                    aria-pressed={Boolean(element.locked)}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleLocked(element)
                    }}
                  >
                    {element.locked ? <LockIcon /> : <UnlockIcon />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </aside>
  )
}
