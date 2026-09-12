/**
 * Common label stock sizes.
 *
 * These are the die-cut sizes that thermal label suppliers actually stock,
 * gathered from TSC, Zebra, Avery and the usual marketplace listings. Inch
 * sizes are given at their exact millimetre equivalents so a 4 × 6 shipping
 * label compiles to the same dot count as the printer's own preset.
 */

import type { MediaSpec, Mm } from './types.js'

export interface LabelPreset {
  id: string
  name: string
  width: Mm
  height: Mm
  gap: Mm
  /** Typical use, shown as a hint next to the size. */
  note?: string
}

const inch = (n: number): Mm => Math.round(n * 25.4 * 10) / 10

export const LABEL_PRESETS: readonly LabelPreset[] = [
  {
    id: '25x15',
    name: '25 × 15 mm',
    width: 25,
    height: 15,
    gap: 2,
    note: 'Jewellery, small parts',
  },
  {
    id: '25x25',
    name: '25 × 25 mm',
    width: 25,
    height: 25,
    gap: 2,
    note: 'Square, often 3 or 4 across',
  },
  {
    id: '30x20',
    name: '30 × 20 mm',
    width: 30,
    height: 20,
    gap: 2,
    note: 'Price tags',
  },
  {
    id: '35x25',
    name: '35 × 25 mm',
    width: 35,
    height: 25,
    gap: 2,
    note: 'Retail',
  },
  {
    id: '38x25',
    name: '38 × 25 mm',
    width: 38,
    height: 25,
    gap: 3,
    note: 'Retail, 1.5 × 1 in',
  },
  {
    id: '40x20',
    name: '40 × 20 mm',
    width: 40,
    height: 20,
    gap: 2,
    note: 'Shelf edge',
  },
  {
    id: '40x30',
    name: '40 × 30 mm',
    width: 40,
    height: 30,
    gap: 2,
    note: 'Product',
  },
  {
    id: '50x25',
    name: '50 × 25 mm',
    width: 50,
    height: 25,
    gap: 2,
    note: 'Part tag, 2 × 1 in',
  },
  {
    id: '50x30',
    name: '50 × 30 mm',
    width: 50,
    height: 30,
    gap: 2,
    note: 'Product',
  },
  {
    id: '50x50',
    name: '50 × 50 mm',
    width: 50,
    height: 50,
    gap: 2,
    note: 'QR, asset tag',
  },
  {
    id: '57x32',
    name: '57 × 32 mm',
    width: 57,
    height: 32,
    gap: 2,
    note: 'Food, weigh scale',
  },
  {
    id: '60x40',
    name: '60 × 40 mm',
    width: 60,
    height: 40,
    gap: 2,
    note: 'Carton',
  },
  {
    id: '75x50',
    name: '75 × 50 mm',
    width: 75,
    height: 50,
    gap: 2,
    note: 'Address, 3 × 2 in',
  },
  {
    id: '100x50',
    name: '100 × 50 mm',
    width: 100,
    height: 50,
    gap: 2,
    note: 'Carton, 4 × 2 in',
  },
  {
    id: '100x75',
    name: '100 × 75 mm',
    width: 100,
    height: 75,
    gap: 2,
    note: 'Warehouse, 4 × 3 in',
  },
  {
    id: '100x100',
    name: '100 × 100 mm',
    width: 100,
    height: 100,
    gap: 2,
    note: 'Pallet',
  },
  {
    id: '100x150',
    name: '100 × 150 mm',
    width: 100,
    height: 150,
    gap: 2,
    note: 'Shipping, 4 × 6 in',
  },
  {
    id: '4x6in',
    name: '4 × 6 in',
    width: inch(4),
    height: inch(6),
    gap: 3,
    note: 'Courier shipping',
  },
]

/** The preset whose size matches the media exactly, if any. */
export function matchPreset(media: Pick<MediaSpec, 'width' | 'height'>): LabelPreset | undefined {
  return LABEL_PRESETS.find(
    (preset) => preset.width === media.width && preset.height === media.height,
  )
}
