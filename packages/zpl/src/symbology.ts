import type { LinearSymbology } from '@lblr/core'
import type { ZplOrientation } from './builder.js'

export interface BarcodeCommandOptions {
  orientation: ZplOrientation
  heightDots: number
  humanReadable: boolean
}

/**
 * Build the ZPL command that draws a linear barcode.
 *
 * Unlike TSPL, where every symbology shares one BARCODE command, ZPL gives each
 * its own command with its own argument order. The `f` argument prints the
 * interpretation line and `g` would place it above the bars; lblr always puts
 * it below, which is the convention everywhere outside pharmaceutical labelling.
 */
export function barcodeCommand(
  symbology: LinearSymbology,
  options: BarcodeCommandOptions,
): string {
  const o = options.orientation
  const h = Math.round(options.heightDots)
  const f = options.humanReadable ? 'Y' : 'N'

  switch (symbology) {
    case 'code128':
      // e=N leaves the check digit to the automatic subset logic; m=N is normal mode.
      return `^BC${o},${h},${f},N,N,N`

    case 'gs1-128':
      // Mode D applies UCC/EAN rules and inserts the FNC1 the standard requires.
      return `^BC${o},${h},${f},N,N,D`

    case 'code39':
      // Second argument is the mod-43 check digit, which Code 39 leaves optional.
      return `^B3${o},N,${h},${f},N`

    case 'code93':
      return `^BA${o},${h},${f},N,N`

    case 'ean13':
      return `^BE${o},${h},${f},N`

    case 'ean8':
      return `^B8${o},${h},${f},N`

    case 'upca':
      return `^BU${o},${h},${f},N,Y`

    case 'upce':
      return `^B9${o},${h},${f},N,Y`

    case 'itf':
      return `^B2${o},${h},${f},N,N`

    case 'itf14':
      // ZPL has no dedicated ITF-14, so it is Interleaved 2 of 5 with the
      // check digit calculated by the printer.
      return `^B2${o},${h},${f},N,Y`

    case 'codabar':
      // Start and stop characters are carried in the data, so A and A here are
      // placeholders the printer overrides.
      return `^BK${o},N,${h},${f},N,A,A`

    case 'msi':
      return `^BM${o},B,${h},${f},N,N`
  }
}
