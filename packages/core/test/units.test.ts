import { describe, expect, it } from 'vitest'
import { mmToDots, mmToDotsExact, moduleDots, roundingErrorMm, snapMm } from '@lblr/core'

describe('unit conversion', () => {
  it('converts millimetres to dots at 203 dpi', () => {
    // 203 dpi is 7.992 dots/mm, which is why a 50 mm label is 400 dots and not 399.
    expect(mmToDots(50, 203)).toBe(400)
    expect(mmToDots(25, 203)).toBe(200)
    expect(mmToDots(104, 203)).toBe(831)
  })

  it('converts at 300 dpi', () => {
    expect(mmToDots(50, 300)).toBe(591)
    expect(mmToDots(25.4, 300)).toBe(300)
  })

  it('keeps the unrounded value available', () => {
    expect(mmToDotsExact(25.4, 203)).toBeCloseTo(203, 5)
  })

  it('never lets a barcode module fall below one dot', () => {
    expect(moduleDots(0.01, 203)).toBe(1)
    expect(moduleDots(0.25, 203)).toBe(2)
    expect(moduleDots(0.5, 203)).toBe(4)
  })

  it('snaps a millimetre value onto the dot grid', () => {
    const snapped = snapMm(3.33, 203)
    expect(mmToDotsExact(snapped, 203) % 1).toBeCloseTo(0, 6)
  })

  it('reports how far a value moves when rounded', () => {
    // 0.25 mm is 1.998 dots, so it barely moves.
    expect(roundingErrorMm(0.25, 203)).toBeLessThan(0.001)
    // 0.3 mm is 2.4 dots, which rounds down and loses real width.
    expect(roundingErrorMm(0.3, 203)).toBeGreaterThan(0.04)
  })
})
