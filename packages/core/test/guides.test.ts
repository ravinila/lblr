import { describe, expect, it } from 'vitest'
import { snapToGuides } from '@lblr/core'

const label = { width: 50, height: 25 }

describe('smart guides', () => {
  it('snaps a box onto the centre of the label and reports the line', () => {
    // 10 wide, so its centre is at x + 5; the label's centre is 25.
    const result = snapToGuides({ x: 19.6, y: 3, width: 10, height: 4 }, [], label, 0.8)
    expect(result.x).toBeCloseTo(20)
    expect(result.guides).toContainEqual({ axis: 'x', at: 25, from: 0, to: 25 })
  })

  it('snaps an edge onto another element and spans the guide across both', () => {
    const other = { x: 30, y: 15, width: 8, height: 5 }
    const result = snapToGuides({ x: 29.5, y: 2, width: 10, height: 4 }, [other], label, 0.8)
    expect(result.x).toBe(30)
    expect(result.guides).toContainEqual({ axis: 'x', at: 30, from: 2, to: 20 })
  })

  it('leaves a box alone when nothing is within tolerance', () => {
    const result = snapToGuides({ x: 7, y: 7, width: 3, height: 3 }, [], label, 0.5)
    expect(result).toEqual({ x: 7, y: 7, guides: [] })
  })

  it('takes the nearest candidate when several are close', () => {
    const near = { x: 12.2, y: 0, width: 1, height: 1 }
    const far = { x: 12.6, y: 0, width: 1, height: 1 }
    const result = snapToGuides({ x: 12, y: 10, width: 4, height: 4 }, [near, far], label, 1)
    expect(result.x).toBeCloseTo(12.2)
  })

  it('snaps both axes independently', () => {
    const result = snapToGuides({ x: 0.3, y: 12.2, width: 10, height: 1 }, [], label, 0.5)
    expect(result.x).toBe(0)
    // Its middle at 12.7 is within reach of the label's middle at 12.5.
    expect(result.y).toBeCloseTo(12)
    expect(result.guides.map((guide) => guide.axis).sort()).toEqual(['x', 'y'])
  })
})
