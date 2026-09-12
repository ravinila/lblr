/**
 * The label document model.
 *
 * One template describes a label in millimetres, independent of any printer
 * language. The TSPL and ZPL compilers both consume this and nothing else, so a
 * template that prints on a TSC printer prints identically on a Zebra.
 *
 * Coordinates are measured from the top-left corner of the label, x to the
 * right and y downward, matching both TSPL and ZPL native origins.
 */

/** Millimetres. Aliased for readability at call sites, not type safety. */
export type Mm = number

export type Rotation = 0 | 90 | 180 | 270

export type TextAlign = 'left' | 'center' | 'right'

/** Linear symbologies supported by both backends. */
export type LinearSymbology =
  | 'code128'
  | 'code39'
  | 'code93'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'itf'
  | 'itf14'
  | 'codabar'
  | 'gs1-128'
  | 'msi'

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export interface BaseElement {
  id: string
  /** Shown in the designer's layer list. Optional; falls back to the type. */
  name?: string
  x: Mm
  y: Mm
  rotation?: Rotation
  /** Locked elements cannot be moved on the canvas. */
  locked?: boolean
  hidden?: boolean
}

export interface TextElement extends BaseElement {
  type: 'text'
  /** Literal text, or a template containing `{{field}}` placeholders. */
  value: string
  /** Cap height in millimetres. Converted to dots at compile time. */
  fontSize: Mm
  /**
   * Faux bold, printed as a second pass offset by one dot. Thermal printers
   * have no bold weight for their internal scalable font, so this is the
   * standard workaround rather than a real typographic weight.
   */
  bold?: boolean
  /**
   * When set the text is emitted as a wrapping block of this width. Required
   * for `align` to have any effect.
   */
  maxWidth?: Mm
  /** Only meaningful together with `maxWidth`. */
  align?: TextAlign
  /** Extra spacing between lines within a block, in millimetres. */
  lineGap?: Mm
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode'
  value: string
  symbology: LinearSymbology
  /** Bar height, excluding any human-readable text. */
  height: Mm
  /**
   * Width of the narrowest bar. Defaults to 0.25 mm, which is 2 dots at
   * 203 dpi — the narrowest width most scanners read reliably.
   */
  moduleWidth?: Mm
  /** Wide-to-narrow ratio for two-width symbologies (code39, itf, codabar). */
  ratio?: number
  /** Print the value below the bars. */
  humanReadable?: boolean
}

export interface QrElement extends BaseElement {
  type: 'qrcode'
  value: string
  /** Size of one QR module. The finished symbol is a multiple of this. */
  moduleWidth: Mm
  errorCorrection?: QrErrorCorrection
}

export interface BoxElement extends BaseElement {
  type: 'box'
  width: Mm
  height: Mm
  /** Stroke thickness. A filled box is a box whose thickness exceeds its size. */
  thickness: Mm
  filled?: boolean
}

export interface LineElement extends BaseElement {
  type: 'line'
  /** Length along the element's own rotation axis. */
  length: Mm
  thickness: Mm
}

export interface ImageElement extends BaseElement {
  type: 'image'
  /** Base64 PNG. Dithered to 1-bit at compile time. */
  data: string
  width: Mm
  height: Mm
}

export type LabelElement =
  TextElement | BarcodeElement | QrElement | BoxElement | LineElement | ImageElement

export type ElementType = LabelElement['type']

/** How the printer finds the edge of each label. */
export type MediaType = 'gap' | 'blackmark' | 'continuous'

export interface MediaSpec {
  width: Mm
  height: Mm
  /** Gap or black mark size between labels. Ignored for continuous stock. */
  gap: Mm
  /** Distance from the gap to the start of the next label. Usually 0. */
  gapOffset?: Mm
  type: MediaType
  /**
   * Labels across the web. Most desktop stock is 1; small labels often come
   * two, three or four across. Every print pass covers the whole web.
   */
  columns?: number
  /** Space between columns on multi-column stock. Defaults to `gap`. */
  columnGap?: Mm
}

/**
 * How many labels one print pass covers.
 *
 * Multi-column stock carries two or three labels side by side across the web,
 * and a run of identical labels can be laid out several rows deep so the
 * printer burns them in one pass. The printer sees the whole grid as a single
 * label of the combined size; the template is stamped into each cell at an
 * offset. Gaps default to the media gap.
 */
export interface PrintLayout {
  /** Labels across the web. Defaults to the stock's own column count. */
  columns?: number
  /** Labels down, printed as one pass. Defaults to 1. */
  rows?: number
  /** Horizontal space between columns. Defaults to `media.gap`. */
  columnGap?: Mm
  /** Vertical space between rows. Defaults to `media.gap`. */
  rowGap?: Mm
}

export interface PrintDefaults {
  /**
   * Burn darkness, 0–15. Higher values need slower speeds. 8 suits most
   * thermal transfer ribbon; direct thermal paper usually wants 10–12.
   */
  darkness: number
  /** Inches per second. The LP 46 Neo tops out at 6. */
  speed: number
  /**
   * Feed direction. 1 prints with the label's top edge leaving the printer
   * first, which is what you want when peeling from a roll.
   */
  direction: 0 | 1
  copies: number
  /**
   * Shift the whole label, for stock that is misaligned in the printer.
   * Negative values pull it left or up.
   */
  offsetX?: Mm
  offsetY?: Mm
  /**
   * Where the label stops after printing, relative to the printer's tear bar.
   * Positive feeds further out; negative holds it back.
   */
  tearOffset?: Mm
  /** Labels per pass. Omitted means a single label. */
  layout?: PrintLayout
}

export interface LabelTemplate {
  /** Schema version, so old files keep opening as the model evolves. */
  version: 1
  id: string
  name: string
  media: MediaSpec
  defaults: PrintDefaults
  elements: LabelElement[]
  /**
   * Field names referenced by `{{placeholders}}`, in the order they should
   * appear when mapping a CSV. Derived on save; not authoritative.
   */
  fields?: string[]
  createdAt?: string
  updatedAt?: string
}

/** One row of merge data. Values are stringified before substitution. */
export type DataRecord = Record<string, string | number | boolean | null | undefined>

export interface CompileOptions {
  dpi: number
  /** Overrides the template's own copy count. */
  copies?: number
  /**
   * Emit the media setup commands (SIZE/GAP/DIRECTION, ^PW/^LL). Turn this off
   * when batching many labels so the setup is sent once rather than per label.
   */
  includeSetup?: boolean
  /** Override darkness and speed at print time without editing the template. */
  darkness?: number
  speed?: number
  /** Overrides the template's own print layout. */
  layout?: PrintLayout
  /**
   * Correction for printers whose built-in font prints larger or smaller than
   * the dot size asked for. Multiplies the height and width arguments sent
   * with every text. Omitted means the printer is trusted.
   */
  textScale?: { height: number; width: number }
}
