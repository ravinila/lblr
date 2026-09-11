/**
 * Compile a label template to ZPL II.
 *
 * Mirrors the TSPL compiler exactly, so a template renders the same on a Zebra
 * as on a TSC. The structural difference is that ZPL wraps each label in
 * `^XA`/`^XZ` and carries its media geometry inside that envelope, where TSPL
 * sets the geometry once and repeats CLS/PRINT.
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

  const bound = bindTemplate(template, data)
  writeLabel(builder, bound, options, warnings)

  return { commands: builder.toString(), debug: builder.toDebugString(), warnings }
}

/**
 * Compile many labels as one job. Printer-level settings are sent once; each
 * record then contributes its own `^XA`…`^XZ` label format.
 */
export function compileBatch(
  template: LabelTemplate,
  records: DataRecord[],
  options: CompileOptions = { dpi: 203 },
): ZplJob {
  const builder = new ZplBuilder()
  const warnings: string[] = []

  if (options.includeSetup !== false) {
    writePrinterSettings(builder, template, options)
  }

  records.forEach((record, index) => {
    const bound = bindTemplate(template, record)
    writeLabel(builder, bound, options, index === 0 ? warnings : [])
  })

  return { commands: builder.toString(), debug: builder.toDebugString(), warnings }
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
}

function writeLabel(
  builder: ZplBuilder,
  template: LabelTemplate,
  options: CompileOptions,
  warnings: string[],
): void {
  const { dpi } = options
  const { media, defaults } = template

  builder.start()
  builder.comment(`${template.name} ${media.width}x${media.height}mm`)
  builder.printWidth(mmToDots(media.width, dpi))
  builder.labelLength(mmToDots(media.height, dpi))
  builder.mediaTracking(mediaTrackingFor(media.type))
  builder.encodingUtf8()
  builder.labelHome(
    mmToDots(defaults.offsetX ?? 0, dpi),
    mmToDots(defaults.offsetY ?? 0, dpi),
  )

  for (const element of template.elements) {
    if (element.hidden) continue
    writeElement(builder, element, dpi, warnings)
  }

  builder.quantity(options.copies ?? defaults.copies)
  builder.end()
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
): void {
  const x = mmToDots(element.x, dpi)
  const y = mmToDots(element.y, dpi)
  const orientation = orientationFor(element.rotation)

  switch (element.type) {
    case 'text': {
      const size = mmToDots(element.fontSize, dpi)

      const drawText = (offsetX: number): void => {
        builder.origin(x + offsetX, y)
        builder.font(size, size, orientation)
        if (element.maxWidth !== undefined) {
          const { height } = unrotatedSize(element)
          const lineHeight = size + mmToDots(element.lineGap ?? 0, dpi)
          const maxLines = Math.max(1, Math.floor(mmToDots(height, dpi) / Math.max(1, lineHeight)))
          builder.fieldBlock(
            mmToDots(element.maxWidth, dpi),
            maxLines,
            mmToDots(element.lineGap ?? 0, dpi),
            alignCode(element.align),
          )
        }
        builder.field(element.value)
      }

      drawText(0)
      // Same faux-bold double-strike as the TSPL backend, for the same reason:
      // the scalable internal font has one weight.
      if (element.bold) drawText(1)
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
      const thickness = element.filled
        ? Math.max(width, height)
        : mmToDots(element.thickness, dpi)
      builder.graphicBox(width, height, thickness)
      break
    }

    case 'line': {
      const length = mmToDots(element.length, dpi)
      const thickness = Math.max(1, mmToDots(element.thickness, dpi))
      const vertical = orientation === 'R' || orientation === 'B'
      builder.origin(x, y)
      builder.graphicBox(
        vertical ? thickness : length,
        vertical ? length : thickness,
        thickness,
      )
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
