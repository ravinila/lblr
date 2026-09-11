/** Add elements, then manage the stack they form. */

import type { LabelElement, LabelTemplate, ValidationIssue } from '@lblr/core'

const ADDABLE: Array<{ kind: LabelElement['type']; label: string }> = [
  { kind: 'text', label: 'Text' },
  { kind: 'barcode', label: 'Barcode' },
  { kind: 'qrcode', label: 'QR code' },
  { kind: 'box', label: 'Box' },
  { kind: 'line', label: 'Line' },
]

function describe(element: LabelElement): string {
  switch (element.type) {
    case 'text':
      return element.value || 'empty'
    case 'barcode':
      return `${element.symbology} · ${element.value || 'empty'}`
    case 'qrcode':
      return element.value || 'empty'
    case 'box':
      return `${element.width} × ${element.height} mm`
    case 'line':
      return `${element.length} mm`
    case 'image':
      return `${element.width} × ${element.height} mm`
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
}

export function Rail({
  template,
  selectedId,
  issues,
  onAdd,
  onSelect,
  onToggleHidden,
  onToggleLocked,
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

  return (
    <aside className="rail">
      <section className="panel">
        <h2>Add</h2>
        <div className="add-grid">
          {ADDABLE.map((item) => (
            <button key={item.kind} className="btn" onClick={() => onAdd(item.kind)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Elements</h2>
        {stacked.length === 0 ? (
          <p className="empty">Nothing on the label yet. Add an element above.</p>
        ) : (
          <div className="stack" role="listbox" aria-label="Elements">
            {stacked.map((element) => {
              const severity = worst.get(element.id)
              return (
                <div
                  key={element.id}
                  className="layer"
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
                  <span
                    className="measure"
                    style={{
                      color:
                        severity === 'error'
                          ? 'var(--error)'
                          : severity === 'warning'
                            ? 'var(--warning)'
                            : 'var(--ink-faint)',
                    }}
                    aria-hidden="true"
                  >
                    {severity ? '!' : '·'}
                  </span>
                  <span className="layer-name">
                    {element.name ?? describe(element)}
                    <span className="layer-kind"> {element.type}</span>
                  </span>
                  <button
                    className="icon-btn"
                    title={element.hidden ? 'Show on the label' : 'Hide from the label'}
                    aria-label={element.hidden ? 'Show on the label' : 'Hide from the label'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleHidden(element)
                    }}
                  >
                    {element.hidden ? '◌' : '◉'}
                  </button>
                  <button
                    className="icon-btn"
                    title={element.locked ? 'Allow dragging' : 'Lock in place'}
                    aria-label={element.locked ? 'Allow dragging' : 'Lock in place'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleLocked(element)
                    }}
                  >
                    {element.locked ? '▣' : '▢'}
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
