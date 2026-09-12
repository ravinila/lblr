/**
 * Compile a label template to ZPL II.
 *
 * Mirrors the TSPL compiler exactly, so a template renders the same on a Zebra
 * as on a TSC. The structural difference is that ZPL wraps each label in
 * `^XA`/`^XZ` and carries its media geometry inside that envelope, where TSPL
 * sets the geometry once and repeats CLS/PRINT.
 */

import {
  NO_TEXT_SCALE,
  bindTemplate,
  layoutCells,
  lineOffset,
  linePitch,
  textCalibrationTemplate,
  wrapText,
  type TextScale,
  layoutSize,
  mmToDots,
  moduleDots,
  resolveLayout,
  type CompileOptions,
  type DataRecord,
  type LabelElement,
  type LabelTemplate,
  type LayoutCell,
} from '@lblr/core'

import { ZplBuilder, orientationFor } from './builder.js'
import { barcodeCommand } from './symbology.js'

export interface ZplJob {
  commands: string
  debug: string
  warnings: string[]
}

/** Compile one label. */
export function compile(
  template: LabelTemplate,
  data: DataRecord = {},
  options: CompileOptions = { dpi: 203 },
): string {
  return compileJob(template, data, options).commands
}

export function compileJob(
  template: LabelTemplate,
  data: DataRecord = {},
  options: CompileOptions = { dpi: 203 },
): ZplJob {
  const builder = new ZplBuilder()
  const warnings: string[] = []

  if (options.includeSetup !== false) {
    writePrinterSettings(builder, template, options)
  }

  // One record on a multi-up layout fills every cell with the same label.
  const bound = bindTemplate(template, data)
  const cells = layoutCells(template.media, resolveLayout(template, options))
  writeLabel(
    builder,
    template,
    cells.map(() => bound),
    options,
    warnings,
  )

  return {
    commands: builder.toString(),
    debug: builder.toDebugString(),
    warnings,
  }
}

/**
 * Compile many labels as one job. Printer-level settings are sent once; each
 * record then contributes its own `^XA`…`^XZ` label format.
 *
 * On a multi-up layout the records fill the grid in reading order, so a 3 × 3
 * layout takes nine records per format. A final format that runs out of
 * records leaves its remaining cells blank rather than repeating a label.
 */
export function compileBatch(
  template: LabelTemplate,
  records: DataRecord[],
  options: CompileOptions = { dpi: 203 },
): ZplJob {
  const builder = new ZplBuilder()
  const warnings: string[] = []
  const cells = layoutCells(template.media, resolveLayout(template, options))

  if (options.includeSetup !== false) {
    writePrinterSettings(builder, template, options)
  }

  const passes = Math.ceil(records.length / cells.length)
  for (let pass = 0; pass < passes; pass += 1) {
    const first = pass * cells.length
    const slice = records.slice(first, first + cells.length)
    writeLabel(
      builder,
      template,
      slice.map((record) => bindTemplate(template, record)),
      options,
      pass === 0 ? warnings : [],
    )
  }

  return {
    commands: builder.toString(),
    debug: builder.toDebugString(),
    warnings,
  }
}

/**
 * Darkness and print rate are immediate commands that persist in the printer,
 * so they sit outside the label format and are sent once per job.
 */
function writePrinterSettings(
  builder: ZplBuilder,
  template: LabelTemplate,
  options: CompileOptions,
): void {
  // The model uses TSPL's 0–15 darkness scale; ZPL's is 0–30.
  const darkness = (options.darkness ?? template.defaults.darkness) * 2
  builder.darkness(darkness)
  builder.printRate(options.speed ?? template.defaults.speed)
  if (template.defaults.tearOffset) {
    builder.tearOff(mmToDots(template.defaults.tearOffset, options.dpi))
  }
}

/**
 * Something to do to the printer that is not a label. ZPL can slew forward
 * but has no command to pull the paper back, so 'backward' is refused.
 */
export type MaintenanceAction = 'calibrate' | 'feed' | 'forward' | 'backward'

export interface MaintenanceOptions extends CompileOptions {
  /** How far 'forward' moves, in millimetres. Defaults to one label. */
  distance?: number
}

/**
 * A job that acts on the printer rather than printing. The media setup goes
 * first so the printer acts on this roll.
 */
export function compileMaintenance(
  template: LabelTemplate,
  action: MaintenanceAction,
  options: MaintenanceOptions = { dpi: 203 },
): string {
  if (action === 'backward') {
    throw new Error('ZPL printers cannot move the paper backward on command.')
  }
  const builder = new ZplBuilder()
  const { media } = template
  const size = layoutSize(media, resolveLayout(template, options))
  builder.start()
  builder.printWidth(mmToDots(size.width, options.dpi))
  builder.labelLength(mmToDots(size.height, options.dpi))
  builder.mediaTracking(mediaTrackingFor(media.type))
  if (action === 'forward') {
    builder.slew(mmToDots(options.distance ?? media.height, options.dpi))
  }
  builder.end()
  if (action === 'feed') builder.feed()
  if (action === 'calibrate') builder.calibrate()
  return builder.toString()
}

/**
 * One `^XA`…`^XZ` format. `bound` holds a bound template per cell of the
 * layout in reading order; a short list leaves the trailing cells blank.
 */
function writeLabel(
  builder: ZplBuilder,
  template: LabelTemplate,
  bound: LabelTemplate[],
  options: CompileOptions,
  warnings: string[],
): void {
  const { dpi } = options
  const { media, defaults } = template
  const layout = resolveLayout(template, options)
  const size = layoutSize(media, layout)
  const cells = layoutCells(media, layout)

  builder.start()
  builder.comment(`${template.name} ${media.width}x${media.height}mm`)
  if (cells.length > 1) {
    builder.comment(`${layout.columns} across x ${layout.rows} down`)
  }
  // The printer treats the whole grid as one label of the combined size.
  builder.printWidth(mmToDots(size.width, dpi))
  builder.labelLength(mmToDots(size.height, dpi))
  builder.mediaTracking(mediaTrackingFor(media.type))
  builder.encodingUtf8()
  // ^LH only moves the label right and down; the shift commands take negatives.
  const shiftX = mmToDots(defaults.offsetX ?? 0, dpi)
  const shiftY = mmToDots(defaults.offsetY ?? 0, dpi)
  builder.labelHome(Math.max(0, shiftX), Math.max(0, shiftY))
  if (shiftX < 0) builder.labelShift(shiftX)
  if (shiftY < 0) builder.labelTop(shiftY)

  bound.forEach((label, index) => {
    const cell = cells[index]
    if (!cell) return
    writeElements(
      builder,
      label,
      dpi,
      index === 0 ? warnings : [],
      cell,
      options.textScale ?? NO_TEXT_SCALE,
    )
  })

  builder.quantity(options.copies ?? defaults.copies)
  builder.end()
}

function writeElements(
  builder: ZplBuilder,
  template: LabelTemplate,
  dpi: number,
  warnings: string[],
  cell: LayoutCell,
  textScale: TextScale,
): void {
  // The cell offset is rounded on its own so an element lands on the same
  // dot within every cell, whatever the gap happens to round to.
  const offset = { x: mmToDots(cell.dx, dpi), y: mmToDots(cell.dy, dpi) }
  if (cell.column > 0 || cell.row > 0) {
    builder.comment(`cell ${cell.column + 1},${cell.row + 1}`)
  }
  for (const element of template.elements) {
    if (element.hidden) continue
    writeElement(builder, element, dpi, warnings, offset, textScale)
  }
}

function mediaTrackingFor(type: LabelTemplate['media']['type']): 'Y' | 'M' | 'N' {
  switch (type) {
    case 'blackmark':
      return 'M'
    case 'continuous':
      return 'N'
    default:
      return 'Y'
  }
}

function writeElement(
  builder: ZplBuilder,
  element: LabelElement,
  dpi: number,
  warnings: string[],
  offset: { x: number; y: number },
  textScale: TextScale,
): void {
  const x = mmToDots(element.x, dpi) + offset.x
  const y = mmToDots(element.y, dpi) + offset.y
  const orientation = orientationFor(element.rotation)

  switch (element.type) {
    case 'text': {
      const size = mmToDots(element.fontSize, dpi)
      const heightDots = Math.max(1, Math.round(size * textScale.height))
      const widthDots = Math.max(1, Math.round(size * textScale.width))

      // Lines are broken here rather than by ^FB, so the canvas and the
      // print agree on where each line ends. Each line is its own field.
      const lines = wrapText(element.value, element.fontSize, element.maxWidth)
      const [stepX, stepY] = lineStep(element.rotation, mmToDots(linePitch(element), dpi))

      // Boxed text with an alignment is aligned by the printer inside a
      // one-line field block, from the glyphs it actually draws.
      const boxed = element.maxWidth !== undefined && element.maxWidth > 0 && element.align
      lines.forEach((line, index) => {
        if (!line) return
        const lineX = x + stepX * index
        const lineY = y + stepY * index
        const drawLine = (offsetX: number): void => {
          builder.origin(lineX + offsetX, lineY)
          builder.font(heightDots, widthDots, orientation)
          if (boxed) {
            builder.fieldBlock(mmToDots(element.maxWidth ?? 0, dpi), 1, 0, alignCode(element.align))
          }
          builder.field(line)
        }
        drawLine(0)
        // Same faux-bold double-strike as the TSPL backend, for the same
        // reason: the scalable internal font has one weight.
        if (element.bold) drawLine(1)
      })
      break
    }

    case 'barcode': {
      const narrow = moduleDots(element.moduleWidth ?? 0.25, dpi)
      const heightDots = mmToDots(element.height, dpi)
      builder.barcodeDefaults(narrow, element.ratio ?? 2, heightDots)
      builder.origin(x, y)
      builder.barcode(
        barcodeCommand(element.symbology, {
          orientation,
          heightDots,
          humanReadable: element.humanReadable ?? false,
        }),
      )
      builder.field(element.value)
      break
    }

    case 'qrcode': {
      const magnification = mmToDots(element.moduleWidth, dpi)
      if (magnification > 10) {
        warnings.push(
          `QR module of ${element.moduleWidth} mm is ${magnification} dots; ZPL caps magnification at 10, so the code will print smaller than designed.`,
        )
      }
      builder.origin(x, y)
      builder.qrcode(element.value, {
        magnification,
        errorCorrection: element.errorCorrection ?? 'M',
        orientation,
      })
      break
    }

    case 'box': {
      const width = mmToDots(element.width, dpi)
      const height = mmToDots(element.height, dpi)
      builder.origin(x, y)
      // ZPL fills a box by making the border as thick as the box itself.
      const thickness = element.filled ? Math.max(width, height) : mmToDots(element.thickness, dpi)
      builder.graphicBox(width, height, thickness)
      break
    }

    case 'line': {
      const length = mmToDots(element.length, dpi)
      const thickness = Math.max(1, mmToDots(element.thickness, dpi))
      const vertical = orientation === 'R' || orientation === 'B'
      builder.origin(x, y)
      builder.graphicBox(vertical ? thickness : length, vertical ? length : thickness, thickness)
      break
    }

    case 'image': {
      warnings.push(
        `"${element.name ?? 'Image'}" was skipped: the ZPL backend does not yet emit graphic fields.`,
      )
      break
    }
  }
}

/** Where the next wrapped line goes, in dots, for each rotation. */
function lineStep(rotation: number | undefined, pitchDots: number): [number, number] {
  switch (rotation ?? 0) {
    case 90:
      return [-pitchDots, 0]
    case 180:
      return [0, -pitchDots]
    case 270:
      return [pitchDots, 0]
    default:
      return [0, pitchDots]
  }
}

/**
 * The text size check: a box drawn in dots and a row of digits, printed with
 * no correction so a ruler measures the printer's own behaviour.
 */
export function compileTextCalibration(template: LabelTemplate, options: CompileOptions): string {
  const { textScale: _ignored, ...rest } = options
  return compile(textCalibrationTemplate(template.media), {}, { ...rest, layout: { rows: 1 } })
}

function alignCode(align: 'left' | 'center' | 'right' | undefined): 'L' | 'C' | 'R' {
  switch (align) {
    case 'center':
      return 'C'
    case 'right':
      return 'R'
    default:
      return 'L'
  }
}
