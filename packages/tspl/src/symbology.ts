import type { LinearSymbology } from '@lblr/core'

/**
 * TSPL barcode type codes, as accepted by the BARCODE command's third argument.
 *
 * The bare codes are used rather than the check-digit variants ("39C", "25C")
 * so that a value the operator typed is the value that gets encoded. Callers
 * that want printer-calculated check digits should append the suffix
 * themselves; the retail symbologies compute theirs regardless.
 */
const TSPL_SYMBOLOGY: Record<LinearSymbology, string> = {
  code128: '128',
  'gs1-128': 'EAN128',
  code39: '39',
  code93: '93',
  ean13: 'EAN13',
  ean8: 'EAN8',
  upca: 'UPCA',
  upce: 'UPCE',
  itf: '25',
  itf14: 'ITF14',
  codabar: 'CODA',
  msi: 'MSI',
}

export function tsplSymbology(symbology: LinearSymbology): string {
  return TSPL_SYMBOLOGY[symbology]
}

/**
 * Human-readable text placement: 0 none, 1 left, 2 centred, 3 right.
 * Centred is what every label printed since 1985 looks like.
 */
export function humanReadableCode(enabled: boolean | undefined): 0 | 2 {
  return enabled ? 2 : 0
}
