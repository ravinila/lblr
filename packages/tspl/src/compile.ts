/**
 * Compile a label template to TSPL.
 *
 * The template is millimetre-based and printer-agnostic; everything here turns
 * it into dots for one specific resolution. Rounding happens once, at this
 * boundary, and never again.
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
  type Rotation,
  type TextElement,
} from '@lblr/core'

import { TsplBuilder, type TsplRotation } from './builder.js'
import { humanReadableCode, tsplSymbology } from './symbology.js'

export interface TsplJob {
  /** The bytes to send, CRLF terminated. */
  commands: string
  /** The same stream annotated with comments, for the UI's code view. */
  debug: string
  /** Things that were dropped or approximated. Never fatal. */
  warnings: string[]
}

/** Compile one label. Returns the command stream ready for transmission. */
export function compile(
  template: LabelTemplate,
  data: DataRecord = {},
  options: CompileOptions = { dpi: 203 },
): string {
  return compileJob(template, data, options).commands
}

/** Compile one label, keeping the diagnostics the UI wants to show. */
export function compileJob(
  template: LabelTemplate,
  data: DataRecord = {},
  options: CompileOptions = { dpi: 203 },
): TsplJob {
  const builder = new TsplBuilder()
  const warnings: string[] = []
  const bound = bindTemplate(template, data)
  const cells = layoutCells(template.media, resolveLayout(template, options))

  if (options.includeSetup !== false) {
    writeSetup(builder, bound, options)
  }

  // One record on a multi-up layout fills every cell with the same label.
  builder.cls()
  const textScale = options.textScale ?? NO_TEXT_SCALE
  cells.forEach((cell, index) => {
    writeElements(builder, bound, options.dpi, index === 0 ? warnings : [], cell, textScale)
  })
  builder.print(options.copies ?? bound.defaults.copies)

  return {
    commands: builder.toString(),
    debug: builder.toDebugString(),
    warnings,
  }
}

/**
 * Compile many labels as one job.
 *
 * The media setup is written once and every record then contributes a
 * CLS/draw/PRINT cycle. On a run of a few hundred labels this saves the printer
 * re-homing the media between every label, which is both faster and kinder to
 * the gap sensor.
 *
 * On a multi-up layout the records fill the grid in reading order, so a 3 × 3
 * layout takes nine records per pass. A final pass that runs out of records
 * leaves its remaining cells blank rather than repeating a label.
 */
export function compileBatch(
  template: LabelTemplate,
  records: DataRecord[],
  options: CompileOptions = { dpi: 203 },
): TsplJob {
  const builder = new TsplBuilder()
  const warnings: string[] = []
  const cells = layoutCells(template.media, resolveLayout(template, options))

  if (options.includeSetup !== false) {
    writeSetup(builder, template, options)
  }

  const passes = Math.ceil(records.length / cells.length)
  for (let pass = 0; pass < passes; pass += 1) {
    const first = pass * cells.length
    const slice = records.slice(first, first + cells.length)
    builder.comment(
      cells.length === 1
        ? `label ${first + 1} of ${records.length}`
        : `labels ${first + 1}-${first + slice.length} of ${records.length}`,
    )
    builder.cls()
    slice.forEach((record, index) => {
      const bound = bindTemplate(template, record)
      // Warnings repeat per record, so only collect them from the first one.
      writeElements(
        builder,
        bound,
        options.dpi,
        first + index === 0 ? warnings : [],
        cells[index],
        options.textScale ?? NO_TEXT_SCALE,
      )
    })
    builder.print(options.copies ?? template.defaults.copies)
  }

  return {
    commands: builder.toString(),
    debug: builder.toDebugString(),
    warnings,
  }
}

function writeSetup(builder: TsplBuilder, template: LabelTemplate, options: CompileOptions): void {
  const { media, defaults } = template
  const layout = resolveLayout(template, options)
  const size = layoutSize(media, layout)

  builder.comment(`${template.name} — ${media.width}×${media.height} mm at ${options.dpi} dpi`)
  if (layout.columns > 1 || layout.rows > 1) {
    builder.comment(
      `${layout.columns} across × ${layout.rows} down: ${size.width}×${size.height} mm per pass`,
    )
  }
  // The printer treats the whole grid as one label; the gap it senses is the
  // one after the last row, which is still the media gap.
  builder.size(size.width, size.height)

  switch (media.type) {
    case 'gap':
      builder.gap(media.gap, media.gapOffset ?? 0)
      break
    case 'blackmark':
      builder.bline(media.gap, media.gapOffset ?? 0)
      break
    case 'continuous':
      builder.gapNone()
      break
  }

  builder.direction(defaults.direction)
  builder.speed(options.speed ?? defaults.speed)
  builder.density(options.darkness ?? defaults.darkness)
  builder.codepageUtf8()

  // REFERENCE only moves the image right and down; anything pulling it the
  // other way goes through SHIFT, which accepts negatives.
  const shiftX = mmToDots(defaults.offsetX ?? 0, options.dpi)
  const shiftY = mmToDots(defaults.offsetY ?? 0, options.dpi)
  if (shiftX > 0 || shiftY > 0) {
    builder.reference(Math.max(0, shiftX), Math.max(0, shiftY))
  }
  if (shiftX < 0 || shiftY < 0) {
    builder.shift(Math.min(0, shiftX), Math.min(0, shiftY))
  }
  if (defaults.tearOffset) {
    builder.offset(defaults.tearOffset)
  }
}

/**
 * Something to do to the printer that is not a label: calibrate the sensor,
 * feed to the next label, or move the paper a set distance either way.
 */
export type MaintenanceAction = 'calibrate' | 'feed' | 'forward' | 'backward'

export interface MaintenanceOptions extends CompileOptions {
  /** How far 'forward' and 'backward' move, in millimetres. Defaults to one label. */
  distance?: number
}

/**
 * A job that acts on the printer rather than printing. Every action carries
 * the media setup first, or the printer would act on whatever roll it last
 * knew about.
 */
export function compileMaintenance(
  template: LabelTemplate,
  action: MaintenanceAction,
  options: MaintenanceOptions = { dpi: 203 },
): string {
  const builder = new TsplBuilder()
  writeSetup(builder, template, options)
  const distance = mmToDots(options.distance ?? template.media.height, options.dpi)
  switch (action) {
    case 'feed':
      builder.formfeed()
      break
    case 'forward':
      builder.feed(distance)
      break
    case 'backward':
      builder.backfeed(distance)
      break
    case 'calibrate':
      if (template.media.type === 'blackmark') builder.blineDetect()
      else builder.gapDetect()
      break
  }
  return builder.toString()
}

function writeElements(
  builder: TsplBuilder,
  template: LabelTemplate,
  dpi: number,
  warnings: string[],
  cell: LayoutCell | undefined,
  textScale: TextScale,
): void {
  // The cell offset is rounded on its own so an element lands on the same
  // dot within every cell, whatever the gap happens to round to.
  const offset = {
    x: mmToDots(cell?.dx ?? 0, dpi),
    y: mmToDots(cell?.dy ?? 0, dpi),
  }
  if (cell && (cell.column > 0 || cell.row > 0)) {
    builder.comment(`cell ${cell.column + 1},${cell.row + 1}`)
  }
  for (const element of template.elements) {
    if (element.hidden) continue
    writeElement(builder, element, dpi, warnings, offset, textScale)
  }
}

function writeElement(
  builder: TsplBuilder,
  element: LabelElement,
  dpi: number,
  warnings: string[],
  offset: { x: number; y: number },
  textScale: TextScale,
): void {
  const x = mmToDots(element.x, dpi) + offset.x
  const y = mmToDots(element.y, dpi) + offset.y
  const rotation = toTsplRotation(element.rotation)

  switch (element.type) {
    case 'text': {
      // The size arguments are the glyph height and width in dots. Equal
      // arguments give the face's natural shape on printers that honour the
      // spec; the text scale corrects the ones that do not.
      const size = mmToDots(element.fontSize, dpi)
      const heightDots = Math.max(1, Math.round(size * textScale.height))
      const widthDots = Math.max(1, Math.round(size * textScale.width))

      // Lines are broken here, never by the printer, so the canvas and the
      // print agree on where each line ends. Each line is its own TEXT.
      const lines = wrapText(element.value, element.fontSize, element.maxWidth)
      const pitch = linePitch(element)
      const [stepX, stepY] = lineStep(element.rotation, mmToDots(pitch, dpi))

      // Centred and right-aligned lines are aligned by the printer about an
      // anchor at the middle or the right edge of the box, using the glyphs
      // it actually draws. That keeps the print true to the canvas, which
      // aligns with its own glyphs too.
      const anchor = textAnchor(element)

      lines.forEach((line, index) => {
        if (!line) return
        const lineX = x + mmToDots(anchor.offset, dpi) + stepX * index
        const lineY = y + stepY * index
        const style = {
          widthDots,
          heightDots,
          rotation,
          ...(anchor.align ? { align: anchor.align } : {}),
        }
        builder.text(lineX, lineY, line, style)

        // Thermal printers have no bold weight for the internal font, so bold
        // is a second pass one dot to the right. Any more than one dot reads
        // as a printing fault rather than a heavier weight.
        if (element.bold) {
          builder.text(lineX + 1, lineY, line, style)
        }
      })
      break
    }

    case 'barcode': {
      const narrow = moduleDots(element.moduleWidth ?? 0.25, dpi)
      const wide = Math.max(narrow + 1, Math.round(narrow * (element.ratio ?? 2)))
      builder.barcode(x, y, tsplSymbology(element.symbology), element.value, {
        heightDots: mmToDots(element.height, dpi),
        narrowDots: narrow,
        wideDots: wide,
        humanReadable: humanReadableCode(element.humanReadable),
        rotation,
      })
      break
    }

    case 'qrcode': {
      const cell = mmToDots(element.moduleWidth, dpi)
      if (cell > 10) {
        warnings.push(
          `QR module of ${element.moduleWidth} mm is ${cell} dots; TSPL caps cell size at 10 dots, so the code will print smaller than designed.`,
        )
      }
      builder.qrcode(x, y, element.value, {
        cellDots: cell,
        errorCorrection: element.errorCorrection ?? 'M',
        rotation,
      })
      break
    }

    case 'box': {
      const width = mmToDots(element.width, dpi)
      const height = mmToDots(element.height, dpi)
      if (element.filled) {
        builder.bar(x, y, width, height)
      } else {
        builder.box(x, y, x + width, y + height, mmToDots(element.thickness, dpi))
      }
      break
    }

    case 'line': {
      const length = mmToDots(element.length, dpi)
      const thickness = Math.max(1, mmToDots(element.thickness, dpi))
      // BAR has no rotation argument, so a vertical line is a tall thin bar.
      const vertical = rotation === 90 || rotation === 270
      builder.bar(x, y, vertical ? thickness : length, vertical ? length : thickness)
      break
    }

    case 'image': {
      warnings.push(
        `"${element.name ?? 'Image'}" was skipped: the TSPL backend does not yet emit bitmaps.`,
      )
      break
    }
  }
}

function toTsplRotation(rotation: Rotation | undefined): TsplRotation {
  return (rotation ?? 0) as TsplRotation
}

/**
 * Where the next line of a wrapped text goes, in dots, for each rotation.
 * Rotation is clockwise, so at 90° the lines stack to the left.
 */
function lineStep(rotation: Rotation | undefined, pitchDots: number): [number, number] {
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

/**
 * Where a line of boxed text is anchored: its offset from the element's left
 * edge in millimetres, and the TSPL alignment code that goes with it.
 */
function textAnchor(element: TextElement): { offset: number; align?: 2 | 3 } {
  if (!element.maxWidth || !element.align || element.align === 'left') return { offset: 0 }
  return element.align === 'center'
    ? { offset: element.maxWidth / 2, align: 2 }
    : { offset: element.maxWidth, align: 3 }
}

/** TSPL BLOCK alignment: 0 default, 1 left, 2 centred, 3 right. */
function alignCode(align: 'left' | 'center' | 'right' | undefined): 0 | 1 | 2 | 3 {
  switch (align) {
    case 'left':
      return 1
    case 'center':
      return 2
    case 'right':
      return 3
    default:
      return 0
  }
}
