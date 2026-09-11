/**
 * Unit conversion.
 *
 * Authoring happens in millimetres because that is how label stock is sold and
 * how people think about a physical label. Printers think in dots. The whole
 * point of keeping the conversion in one place is that it happens exactly once,
 * at compile time, with explicit rounding — a barcode module that lands on a
 * fractional dot is the single most common cause of an unscannable label.
 */

export const MM_PER_INCH = 25.4

/** Resolutions found on desktop thermal printers. */
export type Dpi = 203 | 300 | 600 | (number & {})

/** Dots per millimetre. 203 dpi gives ~7.99, which is why everyone calls it 8. */
export function dotsPerMm(dpi: number): number {
  return dpi / MM_PER_INCH
}

/** Convert millimetres to whole dots, rounded to nearest. */
export function mmToDots(mm: number, dpi: number): number {
  return Math.round(mm * dotsPerMm(dpi))
}

/** Convert millimetres to dots without rounding. Use when you need the error. */
export function mmToDotsExact(mm: number, dpi: number): number {
  return mm * dotsPerMm(dpi)
}

export function dotsToMm(dots: number, dpi: number): number {
  return dots / dotsPerMm(dpi)
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH
}

/**
 * Snap a millimetre value to the nearest whole dot at the given resolution.
 * The designer calls this while dragging so that positions the user sets are
 * positions the printer can actually reproduce.
 */
export function snapMm(mm: number, dpi: number): number {
  return dotsToMm(mmToDots(mm, dpi), dpi)
}

/**
 * How far a millimetre value moves when rounded to whole dots. Surfaced by the
 * validator so a 0.4 mm module width can warn that it is really 0.375 mm.
 */
export function roundingErrorMm(mm: number, dpi: number): number {
  return Math.abs(dotsToMm(mmToDots(mm, dpi), dpi) - mm)
}

/**
 * Barcode module width in whole dots, never below 1.
 *
 * A module narrower than one dot cannot be printed, and a fractional module
 * width makes the wide/narrow ratio drift across the symbol until a scanner
 * gives up. Callers should compare the result against `mmToDotsExact` and warn
 * the user when the two disagree meaningfully.
 */
export function moduleDots(moduleWidthMm: number, dpi: number): number {
  return Math.max(1, Math.round(mmToDotsExact(moduleWidthMm, dpi)))
}
