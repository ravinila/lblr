/**
 * Element constructors.
 *
 * These exist so that building a template by hand reads as a description of a
 * label rather than as object literals full of optional fields. Each applies
 * the defaults that suit a 203 dpi desktop printer.
 */

import type {
  BarcodeElement,
  BoxElement,
  ImageElement,
  LineElement,
  QrElement,
  TextElement,
} from './types.js'

/**
 * Identifiers only need to be unique within a template, and they end up in
 * saved JSON, so a short random string beats a UUID for readability.
 */
export function elementId(): string {
  return Math.random().toString(36).slice(2, 10)
}

type Input<T> = Omit<T, 'id' | 'type'> & { id?: string }

export function text(input: Input<TextElement>): TextElement {
  return { id: input.id ?? elementId(), type: 'text', ...input }
}

/**
 * `moduleWidth` defaults to 0.25 mm: exactly 2 dots at 203 dpi, and the
 * narrowest bar that consumer scanners read dependably off thermal stock.
 */
export function barcode(input: Input<BarcodeElement>): BarcodeElement {
  return {
    id: input.id ?? elementId(),
    type: 'barcode',
    moduleWidth: 0.25,
    ratio: 2,
    humanReadable: true,
    ...input,
  }
}

export function qrcode(input: Input<QrElement>): QrElement {
  return {
    id: input.id ?? elementId(),
    type: 'qrcode',
    errorCorrection: 'M',
    ...input,
  }
}

export function box(input: Input<BoxElement>): BoxElement {
  return { id: input.id ?? elementId(), type: 'box', ...input }
}

export function line(input: Input<LineElement>): LineElement {
  return { id: input.id ?? elementId(), type: 'line', ...input }
}

export function image(input: Input<ImageElement>): ImageElement {
  return { id: input.id ?? elementId(), type: 'image', ...input }
}
