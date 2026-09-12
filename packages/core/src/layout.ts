/**
 * Multi-up layout.
 *
 * The compilers never reason about columns and rows directly. They ask for the
 * resolved grid, the size of media it occupies and the offset of every cell,
 * all in millimetres, and stamp the label into each cell. Keeping the
 * arithmetic here means TSPL and ZPL cannot disagree about where column two
 * starts.
 *
 * The stock decides the columns. A roll that carries four labels across is
 * four across whether or not anyone asked, because the printer sees the whole
 * web; the only free choice at print time is how many rows one pass covers.
 */

import type { CompileOptions, MediaSpec, Mm, PrintLayout } from './types.js'

export interface ResolvedLayout {
  columns: number
  rows: number
  columnGap: Mm
  rowGap: Mm
}

export interface LayoutCell {
  column: number
  row: number
  /** Offset of the cell's top-left corner from the media origin. */
  dx: Mm
  dy: Mm
}

export const SINGLE_LAYOUT: PrintLayout = { columns: 1, rows: 1 }

type LayoutSource = {
  media: Pick<MediaSpec, 'gap' | 'type' | 'columns' | 'columnGap'>
  defaults?: { layout?: PrintLayout }
}

/**
 * The layout a job should use. Each field falls back on its own: an explicit
 * option, then the template's stored layout, then the stock itself.
 */
export function resolveLayout(
  template: LayoutSource,
  options?: Pick<CompileOptions, 'layout'>,
): ResolvedLayout {
  const { media } = template
  const stored = template.defaults?.layout ?? {}
  const requested = options?.layout ?? {}
  const gap = media.type === 'continuous' ? 0 : media.gap
  const columnGap = media.type === 'continuous' ? 0 : (media.columnGap ?? gap)

  return {
    columns: atLeastOne(requested.columns ?? stored.columns ?? media.columns),
    rows: atLeastOne(requested.rows ?? stored.rows),
    columnGap: Math.max(0, requested.columnGap ?? stored.columnGap ?? columnGap),
    rowGap: Math.max(0, requested.rowGap ?? stored.rowGap ?? gap),
  }
}

/** The stock alone, as one row: what the designer draws and what a plain print covers. */
export function stockLayout(media: MediaSpec): ResolvedLayout {
  return resolveLayout({ media }, { layout: { rows: 1 } })
}

/** Width and height of media that one pass of the layout covers. */
export function layoutSize(media: MediaSpec, layout: ResolvedLayout): { width: Mm; height: Mm } {
  return {
    width: round(media.width * layout.columns + layout.columnGap * (layout.columns - 1)),
    height: round(media.height * layout.rows + layout.rowGap * (layout.rows - 1)),
  }
}

/** Every cell in reading order: left to right, then top to bottom. */
export function layoutCells(media: MediaSpec, layout: ResolvedLayout): LayoutCell[] {
  const cells: LayoutCell[] = []
  for (let row = 0; row < layout.rows; row += 1) {
    for (let column = 0; column < layout.columns; column += 1) {
      cells.push({
        column,
        row,
        dx: round(column * (media.width + layout.columnGap)),
        dy: round(row * (media.height + layout.rowGap)),
      })
    }
  }
  return cells
}

export function isSingleLayout(layout: ResolvedLayout | PrintLayout): boolean {
  return (layout.columns ?? 1) <= 1 && (layout.rows ?? 1) <= 1
}

function atLeastOne(value: number | undefined): number {
  return Math.max(1, Math.floor(value || 1))
}

/** Trim floating-point noise so 3 × 25.4 does not become 76.19999999999999. */
function round(mm: number): number {
  return Math.round(mm * 1000) / 1000
}
