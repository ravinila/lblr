/**
 * Bounding box estimation.
 *
 * The designer needs to draw selection handles and the validator needs to know
 * whether an element runs off the label, and both need that answer before the
 * printer has rendered anything. These are estimates: the printer's internal
 * fonts and barcode encoders are the authority, so treat the numbers as close
 * enough to lay out with, not as a guarantee.
 */

import { TEXT_ASPECT, lineGapFor, textLineWidth, wrapText } from './text.js'
import type { BarcodeElement, LabelElement, LinearSymbology, QrElement } from './types.js'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Kept for the barcode estimates; text sizing lives in text.ts now. */
const CONDENSED_ASPECT = TEXT_ASPECT

/** Height of the human-readable line printed under a barcode. */
const HUMAN_READABLE_MM = 2.5

/** Gap between the bars and the human-readable line. */
const HUMAN_READABLE_GAP_MM = 0.5

/**
 * Byte-mode capacity per QR version at each error correction level.
 * Versions 1–15 cover every realistic label payload; longer values clamp to
 * the largest entry and the estimate degrades gracefully.
 */
const QR_BYTE_CAPACITY: Record<'L' | 'M' | 'Q' | 'H', number[]> = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220],
}

/** Bounding box of an element in label coordinates, accounting for rotation. */
export function elementBounds(element: LabelElement): Bounds {
  const { width, height } = unrotatedSize(element)
  const rotation = element.rotation ?? 0
  const swapped = rotation === 90 || rotation === 270
  return {
    x: element.x,
    y: element.y,
    width: swapped ? height : width,
    height: swapped ? width : height,
  }
}

/** Size before rotation is applied. */
export function unrotatedSize(element: LabelElement): { width: number; height: number } {
  switch (element.type) {
    case 'text': {
      // The same line breaks the compilers and the canvas use.
      const lines = wrapText(element.value, element.fontSize, element.maxWidth)
      const widest = lines.reduce(
        (max, line) => Math.max(max, textLineWidth(line, element.fontSize)),
        0,
      )
      const wrapAt =
        element.maxWidth !== undefined && element.maxWidth > 0 ? element.maxWidth : null
      return {
        width: wrapAt ?? widest,
        height: lines.length * element.fontSize + (lines.length - 1) * lineGapFor(element),
      }
    }

    case 'barcode': {
      const extra = element.humanReadable ? HUMAN_READABLE_MM + HUMAN_READABLE_GAP_MM : 0
      return {
        width: estimateBarcodeWidth(element),
        height: element.height + extra,
      }
    }

    case 'qrcode': {
      const size = estimateQrSize(element)
      return { width: size, height: size }
    }

    case 'box':
      return { width: element.width, height: element.height }

    case 'line':
      return { width: element.length, height: element.thickness }

    case 'image':
      return { width: element.width, height: element.height }
  }
}

/**
 * Estimated printed width of a linear barcode, in millimetres.
 *
 * Each symbology has a fixed module count per character plus start, stop and
 * check patterns. Quiet zones are excluded — they are the caller's business,
 * because the validator reports on them separately.
 */
export function estimateBarcodeWidth(element: BarcodeElement): number {
  const moduleWidth = element.moduleWidth ?? 0.25
  const ratio = element.ratio ?? 2
  return countModules(element.symbology, element.value, ratio) * moduleWidth
}

/** Width in narrow-bar units. Two-width symbologies factor in the wide ratio. */
function countModules(symbology: LinearSymbology, value: string, ratio: number): number {
  const n = value.length

  switch (symbology) {
    // Fixed-length retail symbologies have fixed module counts.
    case 'ean13':
    case 'upca':
      return 95
    case 'ean8':
      return 67
    case 'upce':
      return 51
    case 'itf14':
      return 9 + 14 * (2 + 3 * ratio)

    case 'code128':
    case 'gs1-128':
      // start + data + check + stop, at 11 modules each; stop carries 2 extra bars.
      return 11 * (n + 3) + 2

    case 'code39': {
      // Nine elements per character, three of them wide, plus an inter-character gap.
      const perChar = 6 + 3 * ratio + 1
      return (n + 2) * perChar
    }

    case 'code93':
      // Nine modules per character, plus start, two checks, stop and a termination bar.
      return 9 * (n + 4) + 1

    case 'codabar': {
      const perChar = 6 + 3 * ratio + 1
      return n * perChar
    }

    case 'itf': {
      // Digits encode in pairs, five elements each, two of them wide.
      const pairs = Math.ceil(n / 2)
      return 6 + pairs * (6 + 4 * ratio) + 1 + ratio
    }

    case 'msi':
      return 3 + n * (4 + 4 * ratio) + 4
  }
}

/** Estimated side length of a QR symbol, in millimetres. */
export function estimateQrSize(element: QrElement): number {
  const capacities = QR_BYTE_CAPACITY[element.errorCorrection ?? 'M']
  const byteLength = utf8Length(element.value)

  let versionIndex = capacities.findIndex((capacity) => capacity >= byteLength)
  if (versionIndex === -1) versionIndex = capacities.length - 1

  const modules = 17 + 4 * (versionIndex + 1)
  return modules * element.moduleWidth
}

/** Byte length once encoded as UTF-8, which is what the QR encoder sees. */
function utf8Length(value: string): number {
  let bytes = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}
