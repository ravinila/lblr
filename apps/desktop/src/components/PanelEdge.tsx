/**
 * The draggable edge of a side panel.
 *
 * Pointer capture keeps the drag alive when the pointer outruns the strip.
 * The width at the press is the reference, so the edge follows the pointer
 * exactly; updates are folded to one per frame. Double-click restores the
 * default width.
 */

import { useRef, type PointerEvent } from 'react'

export interface PanelEdgeProps {
  /** Current width of the panel in pixels. */
  width: number
  /** 1 when dragging right widens the panel (a left panel), -1 when it narrows it. */
  direction: 1 | -1
  min: number
  max: number
  onWidth: (width: number) => void
  onReset: () => void
  label: string
}

export function PanelEdge({ width, direction, min, max, onWidth, onReset, label }: PanelEdgeProps) {
  const start = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const frame = useRef(0)

  return (
    <div
      className="panel-edge"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { pointerId: event.pointerId, x: event.clientX, width }
      }}
      onPointerMove={(event) => {
        const from = start.current
        if (!from || from.pointerId !== event.pointerId) return
        const next = Math.min(max, Math.max(min, from.width + direction * (event.clientX - from.x)))
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => onWidth(next))
      }}
      onPointerUp={(event) => {
        if (start.current?.pointerId !== event.pointerId) return
        start.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        start.current = null
      }}
      onDoubleClick={onReset}
    />
  )
}
