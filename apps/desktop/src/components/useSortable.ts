/**
 * Reordering a vertical list by dragging its rows.
 *
 * Pointer events rather than HTML drag and drop: the desktop shell claims
 * native drag and drop on Windows, and pointer capture is smoother anyway.
 * Row geometry is measured once when a drag starts, moves are folded into
 * one update per animation frame, and every row is positioned with a
 * transform so nothing reflows while the pointer is down. The dragged row
 * follows the pointer; the others slide out of its way.
 *
 * The hook knows nothing about what the rows are. It hands back props for
 * the container and each row, plus enough state to style them.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4

interface Drag {
  from: number
  /** Where the row would land if released now. */
  to: number
  /** Pointer travel since the press, in pixels. */
  dy: number
}

interface Press {
  index: number
  pointerId: number
  startY: number
  /** Top and height of every row when the press began. */
  rows: Array<{ top: number; height: number }>
}

export interface SortableRowProps {
  'data-sortable-row': string
  style: CSSProperties | undefined
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
}

export interface Sortable {
  containerRef: (node: HTMLElement | null) => void
  /** Index of the row being dragged, or null. */
  dragging: number | null
  /** True while a press has not yet become a drag; clicks still go through. */
  rowProps: (index: number) => SortableRowProps
}

/**
 * @param count   number of rows, top to bottom
 * @param onSort  called on release with the dragged row's index and its new index
 */
export function useSortable(count: number, onSort: (from: number, to: number) => void): Sortable {
  const container = useRef<HTMLElement | null>(null)
  const press = useRef<Press | null>(null)
  const frame = useRef(0)
  const pending = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const containerRef = useCallback((node: HTMLElement | null) => {
    container.current = node
  }, [])

  const measure = (): Press['rows'] => {
    const host = container.current
    if (!host) return []
    return Array.from(host.querySelectorAll<HTMLElement>('[data-sortable-row]')).map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
  }

  /** Where a row whose centre is at `centreY` belongs among the other rows. */
  const indexFor = (rows: Press['rows'], from: number, centreY: number): number => {
    let index = 0
    rows.forEach((row, i) => {
      if (i === from) return
      if (row.top + row.height / 2 < centreY) index += 1
    })
    return index
  }

  const flush = () => {
    frame.current = 0
    if (pending.current) setDrag(pending.current)
  }

  const onPointerDown = (index: number) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    // Controls inside a row keep their own clicks.
    if ((event.target as HTMLElement).closest('button, input, select, textarea')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { index, pointerId: event.pointerId, startY: event.clientY, rows: measure() }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    const dy = event.clientY - current.startY
    if (!drag && !pending.current && Math.abs(dy) < DRAG_THRESHOLD) return

    const row = current.rows[current.index]
    if (!row) return
    const centre = row.top + row.height / 2 + dy
    pending.current = {
      from: current.index,
      to: Math.min(count - 1, Math.max(0, indexFor(current.rows, current.index, centre))),
      dy,
    }
    if (!frame.current) frame.current = requestAnimationFrame(flush)
  }

  const finish = (event: PointerEvent<HTMLElement>, commit: boolean) => {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const result = pending.current ?? drag
    press.current = null
    pending.current = null
    setDrag(null)
    if (commit && result && result.to !== result.from) onSort(result.from, result.to)
  }

  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined
    const current = press.current
    const row = current?.rows[current.index]
    if (!current || !row) return undefined
    // Rows keep a uniform pitch in this list; the gap is whatever separates
    // the first two measured rows.
    const next = current.rows[1]
    const pitch =
      row.height +
      (next && current.rows[0] ? next.top - (current.rows[0].top + current.rows[0].height) : 0)

    if (index === drag.from) {
      return {
        transform: `translateY(${drag.dy}px)`,
        transition: 'none',
        zIndex: 2,
        position: 'relative',
      }
    }
    if (drag.from < index && index <= drag.to) return { transform: `translateY(${-pitch}px)` }
    if (drag.to <= index && index < drag.from) return { transform: `translateY(${pitch}px)` }
    return undefined
  }

  return {
    containerRef,
    dragging: drag?.from ?? null,
    rowProps: (index) => ({
      'data-sortable-row': String(index),
      style: rowStyle(index),
      onPointerDown: onPointerDown(index),
      onPointerMove,
      onPointerUp: (event) => finish(event, true),
      onPointerCancel: (event) => finish(event, false),
    }),
  }
}
