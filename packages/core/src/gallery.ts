/**
 * Starter designs.
 *
 * Each design is a function of the label size rather than a fixed file, so
 * the same "product tag" lays itself out sensibly on a 25 × 25 mm square and
 * on a 100 × 50 mm carton label. Sizes are proportions of the label with
 * sensible floors and ceilings: type never drops below what a 203 dpi head
 * can render legibly, and a barcode is only offered where its narrowest
 * legible module still fits the width.
 */

import { barcode, box, line, qrcode, text } from './elements.js'
import { estimateBarcodeWidth } from './geometry.js'
import { TEXT_ASPECT } from './text.js'
import type { DataRecord, LabelElement, MediaSpec, Mm } from './types.js'

export interface LabelDesign {
  id: string
  name: string
  /** What it is for, shown under the name. */
  note: string
  /** Smallest label it lays out well on. */
  minWidth: Mm
  minHeight: Mm
  /** Values that make the preview look like a real label. */
  sample: DataRecord
  build: (media: Pick<MediaSpec, 'width' | 'height'>) => LabelElement[]
}

type Size = Pick<MediaSpec, 'width' | 'height'>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const tenth = (value: number) => Math.round(value * 10) / 10

/** Margin inside the label edge. */
const margin = (size: Size) => tenth(clamp(Math.min(size.width, size.height) * 0.07, 1, 4))

/** A cap height that reads as a heading on this label. */
const heading = (size: Size) => tenth(clamp(size.height * 0.12, 1.8, 7))

/** A cap height for supporting text. */
const body = (size: Size) => tenth(clamp(size.height * 0.085, 1.5, 4.5))

/**
 * The widest Code 128 module that fits `chars` characters inside `width`,
 * as a whole number of dots at 203 dpi. The width comes from the same
 * estimate the validator uses, so a design that fits here fits there.
 */
function moduleFor(width: Mm, chars: number): Mm {
  const dot = 25.4 / 203
  const perDot = estimateBarcodeWidth(
    barcode({
      x: 0,
      y: 0,
      value: '0'.repeat(chars),
      symbology: 'code128',
      height: 1,
      moduleWidth: dot,
    }),
  )
  const dots = Math.floor(width / perDot)
  return Math.max(2, Math.min(4, dots)) * dot
}

/** The largest QR that fits the shorter side, as a whole number of dots per module. */
function qrModuleFor(side: Mm): Mm {
  // Version 2 (25 modules) carries a typical SKU or URL at level M.
  const dot = 25.4 / 203
  return Math.max(2, Math.min(8, Math.floor(side / 25 / dot))) * dot
}

export const LABEL_DESIGNS: readonly LabelDesign[] = [
  {
    id: 'blank',
    name: 'Blank',
    note: 'Start from nothing',
    minWidth: 0,
    minHeight: 0,
    sample: {},
    build: () => [],
  },
  {
    id: 'product',
    name: 'Product tag',
    note: 'Name, SKU and a Code 128 barcode',
    minWidth: 38,
    minHeight: 18,
    sample: { name: 'ACME Bearing 6204', sku: '7894561230' },
    build: (size) => {
      const m = margin(size)
      const h = heading(size)
      const b = body(size)
      const usable = size.width - m * 2
      const barTop = m + h + b * 1.9
      const barHeight = tenth(Math.max(4, size.height - barTop - m - 3))
      return [
        text({ x: m, y: m, value: '{{name}}', fontSize: h, bold: true, maxWidth: usable }),
        text({ x: m, y: tenth(m + h * 1.45), value: '{{sku}}', fontSize: b }),
        barcode({
          x: m,
          y: tenth(barTop),
          value: '{{sku}}',
          symbology: 'code128',
          height: barHeight,
          moduleWidth: moduleFor(usable, 10),
          humanReadable: true,
        }),
      ]
    },
  },
  {
    id: 'qr-tag',
    name: 'QR tag',
    note: 'Name and SKU beside a QR code',
    minWidth: 20,
    minHeight: 15,
    sample: { name: 'ACME Bearing 6204', sku: '7894561230' },
    build: (size) => {
      const m = margin(size)
      const square = size.width <= size.height * 1.3
      const h = heading(size)
      const b = body(size)
      if (square) {
        // Stack: text on top, QR filling what is left below.
        const qrTop = m + h + b * 1.7
        const side = Math.max(6, Math.min(size.width - m * 2, size.height - qrTop - m))
        return [
          text({
            x: m,
            y: m,
            value: '{{name}}',
            fontSize: h,
            bold: true,
            maxWidth: size.width - m * 2,
          }),
          text({ x: m, y: tenth(m + h * 1.45), value: '{{sku}}', fontSize: b }),
          qrcode({ x: m, y: tenth(qrTop), value: '{{sku}}', moduleWidth: qrModuleFor(side) }),
        ]
      }
      // Wide: QR on the left, text beside it.
      const side = size.height - m * 2
      const textX = tenth(m * 2 + side)
      return [
        qrcode({ x: m, y: m, value: '{{sku}}', moduleWidth: qrModuleFor(side) }),
        text({
          x: textX,
          y: m,
          value: '{{name}}',
          fontSize: h,
          bold: true,
          maxWidth: tenth(size.width - textX - m),
        }),
        text({ x: textX, y: tenth(m + h * 2.4), value: '{{sku}}', fontSize: b }),
      ]
    },
  },
  {
    id: 'price',
    name: 'Price tag',
    note: 'Big price, name and barcode',
    minWidth: 38,
    minHeight: 20,
    sample: { name: 'Cotton tee, navy', price: '₹499', sku: '8901234567' },
    build: (size) => {
      const m = margin(size)
      const b = body(size)
      const price = tenth(clamp(size.height * 0.28, 4, 14))
      const usable = size.width - m * 2
      const barTop = m + b * 1.5 + price * 1.35
      const barHeight = tenth(Math.max(3, size.height - barTop - m - 3))
      return [
        text({ x: m, y: m, value: '{{name}}', fontSize: b, maxWidth: usable }),
        text({
          x: m,
          y: tenth(m + b * 1.5),
          value: '{{price}}',
          fontSize: price,
          bold: true,
          maxWidth: usable,
          align: 'right',
        }),
        barcode({
          x: m,
          y: tenth(barTop),
          value: '{{sku}}',
          symbology: 'code128',
          height: barHeight,
          moduleWidth: moduleFor(usable, 10),
          humanReadable: true,
        }),
      ]
    },
  },
  {
    id: 'address',
    name: 'Address',
    note: 'A name and a wrapped address',
    minWidth: 40,
    minHeight: 20,
    sample: {
      name: 'Priya Raman',
      address: '14 Lake View Road, Nungambakkam',
      city: 'Chennai 600034',
    },
    build: (size) => {
      const m = margin(size)
      const h = heading(size)
      const b = body(size)
      const usable = size.width - m * 2
      return [
        text({ x: m, y: m, value: '{{name}}', fontSize: h, bold: true, maxWidth: usable }),
        text({
          x: m,
          y: tenth(m + h * 1.6),
          value: '{{address}}',
          fontSize: b,
          maxWidth: usable,
          lineGap: tenth(b * 0.35),
        }),
        text({
          x: m,
          y: tenth(size.height - m - b),
          value: '{{city}}',
          fontSize: b,
          maxWidth: usable,
        }),
      ]
    },
  },
  {
    id: 'shipping',
    name: 'Shipping',
    note: 'Recipient, sender and a tracking barcode',
    minWidth: 70,
    minHeight: 45,
    sample: {
      to: 'Priya Raman, 14 Lake View Road, Chennai 600034',
      from: 'ACME Stores, Bengaluru',
      tracking: '1Z999AA10123456784',
    },
    build: (size) => {
      const m = margin(size)
      const h = heading(size)
      const b = body(size)
      const usable = size.width - m * 2
      const rule = tenth(m + b * 1.4 + b * 1.6)
      const barTop = tenth(size.height * 0.58)
      const barHeight = tenth(Math.max(8, size.height - barTop - m - 3.5))
      return [
        text({ x: m, y: m, value: 'FROM {{from}}', fontSize: b, maxWidth: usable }),
        line({ x: m, y: rule, length: usable, thickness: 0.3 }),
        text({
          x: m,
          y: tenth(rule + b * 0.8),
          value: 'TO {{to}}',
          fontSize: h,
          bold: true,
          maxWidth: usable,
          lineGap: tenth(h * 0.3),
        }),
        barcode({
          x: m,
          y: barTop,
          value: '{{tracking}}',
          symbology: 'code128',
          height: barHeight,
          moduleWidth: moduleFor(usable, 18),
          humanReadable: true,
        }),
      ]
    },
  },
  {
    id: 'framed-text',
    name: 'Framed text',
    note: 'One line, centred, in a frame',
    minWidth: 15,
    minHeight: 10,
    sample: { text: 'FRAGILE' },
    build: (size) => {
      const m = margin(size)
      // As tall as the label allows, but never so large that a short word
      // like FRAGILE has to wrap: eight characters must fit the frame.
      const usable = size.width - m * 4
      const cap = tenth(clamp(Math.min(size.height * 0.3, usable / (8 * TEXT_ASPECT)), 2, 14))
      return [
        box({
          x: m,
          y: m,
          width: tenth(size.width - m * 2),
          height: tenth(size.height - m * 2),
          thickness: 0.4,
        }),
        text({
          x: m * 2,
          y: tenth((size.height - cap) / 2),
          value: '{{text}}',
          fontSize: cap,
          bold: true,
          maxWidth: tenth(size.width - m * 4),
          align: 'center',
        }),
      ]
    },
  },
]

/** The designs that lay out well on this label, best fit first. */
export function designsFor(size: Size): LabelDesign[] {
  return LABEL_DESIGNS.filter(
    (design) => size.width >= design.minWidth && size.height >= design.minHeight,
  )
}

export function findDesign(id: string): LabelDesign | undefined {
  return LABEL_DESIGNS.find((design) => design.id === id)
}
