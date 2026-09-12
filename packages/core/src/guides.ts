/**
 * Smart guides: snapping a moving box to the things around it.
 *
 * While an element is dragged, its left edge, centre and right edge are
 * compared with the same lines on the label and on every other element, and
 * likewise top, middle and bottom. The nearest match within tolerance wins,
 * the box is nudged onto it, and the matching lines come back so the
 * designer can draw them. This is geometry only, in millimetres; it knows
 * nothing about pixels, Konva or pointers, which is what makes it testable.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A line drawn to show what the box snapped to. */
export interface Guide {
  axis: 'x' | 'y'
  /** Position of the line along its axis. */
  at: number
  /** Extent of the line along the other axis. */
  from: number
  to: number
}

export interface SnapResult {
  x: number
  y: number
  guides: Guide[]
}

interface Line {
  at: number
  from: number
  to: number
}

/** The three alignment lines of a box along one axis, plus their extents on the other. */
function lines(box: Box, axis: 'x' | 'y'): Line[] {
  const start = axis === 'x' ? box.x : box.y
  const size = axis === 'x' ? box.width : box.height
  const from = axis === 'x' ? box.y : box.x
  const to = from + (axis === 'x' ? box.height : box.width)
  return [
    { at: start, from, to },
    { at: start + size / 2, from, to },
    { at: start + size, from, to },
  ]
}

function snapAxis(
  moving: Box,
  targets: Line[],
  axis: 'x' | 'y',
  tolerance: number,
): { shift: number; guides: Guide[] } {
  const own = lines(moving, axis)
  let best: { shift: number; distance: number } | null = null

  for (const line of own) {
    for (const target of targets) {
      const shift = target.at - line.at
      const distance = Math.abs(shift)
      if (distance > tolerance) continue
      // Nearest wins; on a tie the earlier candidate (an edge before a centre)
      // keeps things stable while dragging.
      if (!best || distance < best.distance - 1e-9) best = { shift, distance }
    }
  }
  if (!best) return { shift: 0, guides: [] }

  // Every target line the snapped box now sits on gets a guide, so aligning
  // with two elements at once shows both.
  const snapped: Box =
    axis === 'x' ? { ...moving, x: moving.x + best.shift } : { ...moving, y: moving.y + best.shift }
  const guides: Guide[] = []
  for (const line of lines(snapped, axis)) {
    for (const target of targets) {
      if (Math.abs(target.at - line.at) > 1e-6) continue
      guides.push({
        axis,
        at: target.at,
        from: Math.min(line.from, target.from),
        to: Math.max(line.to, target.to),
      })
    }
  }
  return { shift: best.shift, guides: dedupe(guides) }
}

function dedupe(guides: Guide[]): Guide[] {
  const seen = new Map<string, Guide>()
  for (const guide of guides) {
    const key = `${guide.axis}:${guide.at.toFixed(3)}`
    const existing = seen.get(key)
    if (!existing) seen.set(key, guide)
    else {
      existing.from = Math.min(existing.from, guide.from)
      existing.to = Math.max(existing.to, guide.to)
    }
  }
  return [...seen.values()]
}

/**
 * Nudge `moving` onto the nearest alignment within `tolerance` millimetres
 * of the label's edges and centre lines and of every box in `others`.
 */
export function snapToGuides(
  moving: Box,
  others: Box[],
  label: { width: number; height: number },
  tolerance: number,
): SnapResult {
  const labelBox: Box = { x: 0, y: 0, width: label.width, height: label.height }
  const targetsX = [labelBox, ...others].flatMap((box) => lines(box, 'x'))
  const targetsY = [labelBox, ...others].flatMap((box) => lines(box, 'y'))

  const x = snapAxis(moving, targetsX, 'x', tolerance)
  const y = snapAxis(moving, targetsY, 'y', tolerance)
  return {
    x: moving.x + x.shift,
    y: moving.y + y.shift,
    guides: [...x.guides, ...y.guides],
  }
}
