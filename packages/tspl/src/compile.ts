/**
 * Compile a label template to TSPL.
 *
 * The template is millimetre-based and printer-agnostic; everything here turns
 * it into dots for one specific resolution. Rounding happens once, at this
 * boundary, and never again.
 */

import {
  bindTemplate,
  mmToDots,
  moduleDots,
  unrotatedSize,
  type CompileOptions,
  type DataRecord,
  type LabelElement,
  type LabelTemplate,
  type Rotation,
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

  if (options.includeSetup !== false) {
    writeSetup(builder, bound, options)
  }

  builder.cls()
  writeElements(builder, bound, options.dpi, warnings)
  builder.print(options.copies ?? bound.defaults.copies)

  return { commands: builder.toString(), debug: builder.toDebugString(), warnings }
}

/**
 * Compile many labels as one job.
 *
 * The media setup is written once and every record then contributes a
 * CLS/draw/PRINT cycle. On a run of a few hundred labels this saves the printer
 * re-homing the media between every label, which is both faster and kinder to
 * the gap sensor.
 */
export function compileBatch(
  template: LabelTemplate,
  records: DataRecord[],
  options: CompileOptions = { dpi: 203 },
): TsplJob {
  const builder = new TsplBuilder()
  const warnings: string[] = []

  if (options.includeSetup !== false) {
    writeSetup(builder, template, options)
  }

  records.forEach((record, index) => {
    const bound = bindTemplate(template, record)
    builder.comment(`label ${index + 1} of ${records.length}`)
    builder.cls()
    // Warnings repeat per record, so only collect them from the first pass.
    writeElements(builder, bound, options.dpi, index === 0 ? warnings : [])
    builder.print(options.copies ?? template.defaults.copies)
  })

  return { commands: builder.toString(), debug: builder.toDebugString(), warnings }
}

function writeSetup(
  builder: TsplBuilder,
  template: LabelTemplate,
  options: CompileOptions,
): void {
  const { media, defaults } = template

  builder.comment(`${template.name} — ${media.width}×${media.height} mm at ${options.dpi} dpi`)
  builder.size(media.width, media.height)

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

  if (defaults.offsetX || defaults.offsetY) {
    builder.reference(
      mmToDots(defaults.offsetX ?? 0, options.dpi),
      mmToDots(defaults.offsetY ?? 0, options.dpi),
    )
  }
}

function writeElements(
  builder: TsplBuilder,
  template: LabelTemplate,
  dpi: number,
  warnings: string[],
): void {
  for (const element of template.elements) {
    if (element.hidden) continue
    writeElement(builder, element, dpi, warnings)
  }
}

function writeElement(
  builder: TsplBuilder,
  element: LabelElement,
  dpi: number,
  warnings: string[],
): void {
  const x = mmToDots(element.x, dpi)
  const y = mmToDots(element.y, dpi)
  const rotation = toTsplRotation(element.rotation)

  switch (element.type) {
    case 'text': {
      // Font "0" is proportionally condensed already, so equal width and height
      // arguments produce the face's natural shape.
      const size = mmToDots(element.fontSize, dpi)

      if (element.maxWidth !== undefined) {
        const { height } = unrotatedSize(element)
        builder.block(
          x,
          y,
          mmToDots(element.maxWidth, dpi),
          mmToDots(height, dpi),
          element.value,
          {
            fontWidthDots: size,
            fontHeightDots: size,
            rotation,
            lineSpacingDots: mmToDots(element.lineGap ?? 0, dpi),
            align: alignCode(element.align),
          },
        )
        if (element.bold) {
          warnings.push(
            `"${element.name ?? element.value}": bold is not applied to wrapping text blocks.`,
          )
        }
        break
      }

      builder.text(x, y, element.value, {
        widthDots: size,
        heightDots: size,
        rotation,
      })

      // Thermal printers have no bold weight for the internal font, so bold is
      // a second pass one dot to the right. Any more than one dot reads as a
      // printing fault rather than a heavier weight.
      if (element.bold) {
        builder.text(x + 1, y, element.value, {
          widthDots: size,
          heightDots: size,
          rotation,
        })
      }
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
