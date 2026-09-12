/**
 * Template validation.
 *
 * These checks are the difference between a label that scans and one that does
 * not. They run in the designer as you edit and again before every print, so
 * problems surface on screen rather than on 500 wasted labels.
 */

import { fieldsIn } from './binding.js'
import { elementBounds } from './geometry.js'
import { mmToDots, mmToDotsExact, roundingErrorMm } from './units.js'
import type { DataRecord, LabelElement, LabelTemplate, LinearSymbology } from './types.js'

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: IssueSeverity
  /** Stable identifier, so the UI can link to an explanation. */
  code: string
  message: string
  /** The offending element, when the issue is element-scoped. */
  elementId?: string
}

/**
 * Below roughly 1.5 mm the internal scalable font stops being legible on
 * 203 dpi thermal stock — strokes merge as the ribbon bleeds.
 */
const MIN_LEGIBLE_FONT_MM = 1.5

/** A module narrower than 2 dots is readable only by good scanners up close. */
const SAFE_MODULE_DOTS = 2

/** Quiet zone either side of a linear barcode, in modules, per the symbology specs. */
const QUIET_ZONE_MODULES = 10

const DIGITS = /^\d+$/
const CODE39_ALPHABET = /^[0-9A-Z\-. $/+%]*$/
const CODABAR_ALPHABET = /^[A-D][0-9\-$:/.+]*[A-D]$/i

export function validateTemplate(
  template: LabelTemplate,
  options: { dpi: number; data?: DataRecord } = { dpi: 203 },
): ValidationIssue[] {
  const { dpi } = options
  const issues: ValidationIssue[] = []

  validateMedia(template, dpi, issues)
  validateDefaults(template, issues)

  for (const element of template.elements) {
    if (element.hidden) continue
    validateBounds(element, template, issues)
    validateElement(element, dpi, issues)
    validateBindings(element, options.data, issues)
  }

  return issues
}

/** True when nothing would stop the template printing correctly. */
export function canPrint(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === 'error')
}

function validateMedia(template: LabelTemplate, dpi: number, issues: ValidationIssue[]): void {
  const { media } = template
  if (media.width <= 0 || media.height <= 0) {
    issues.push({
      severity: 'error',
      code: 'media/invalid-size',
      message: 'Label width and height must both be greater than zero.',
    })
  }
  if (media.type !== 'continuous' && media.gap <= 0) {
    issues.push({
      severity: 'warning',
      code: 'media/no-gap',
      message:
        'Gap is zero on die-cut stock. The printer will not find the label edge and will drift over a long run.',
    })
  }
  // Not an error: the user may be targeting a wider printer than the preview.
  if (mmToDots(media.width, dpi) > 1280) {
    issues.push({
      severity: 'warning',
      code: 'media/exceeds-printhead',
      message: `Label is ${media.width} mm wide, which exceeds the print width of most desktop printers (about 104 mm).`,
    })
  }
}

function validateDefaults(template: LabelTemplate, issues: ValidationIssue[]): void {
  const { darkness, speed, copies } = template.defaults
  if (darkness < 0 || darkness > 15) {
    issues.push({
      severity: 'error',
      code: 'print/darkness-range',
      message: 'Darkness must be between 0 and 15.',
    })
  }
  if (speed <= 0) {
    issues.push({
      severity: 'error',
      code: 'print/speed-range',
      message: 'Speed must be greater than zero inches per second.',
    })
  }
  if (darkness >= 12 && speed >= 5) {
    issues.push({
      severity: 'warning',
      code: 'print/darkness-speed',
      message: 'High darkness at high speed smears on most media. Drop the speed or the darkness.',
    })
  }
  if (copies < 1) {
    issues.push({
      severity: 'error',
      code: 'print/copies',
      message: 'Copies must be at least 1.',
    })
  }
}

function validateBounds(
  element: LabelElement,
  template: LabelTemplate,
  issues: ValidationIssue[],
): void {
  const bounds = elementBounds(element)
  const { width, height } = template.media
  const overflowsRight = bounds.x + bounds.width > width + 0.01
  const overflowsBottom = bounds.y + bounds.height > height + 0.01
  if (bounds.x < -0.01 || bounds.y < -0.01) {
    issues.push({
      severity: 'error',
      code: 'layout/negative-position',
      elementId: element.id,
      message: `${describe(element)} sits off the top or left edge of the label.`,
    })
  }
  if (overflowsRight || overflowsBottom) {
    issues.push({
      severity: 'error',
      code: 'layout/overflow',
      elementId: element.id,
      message: `${describe(element)} extends past the edge of the label and will be clipped.`,
    })
  }
}

function validateElement(element: LabelElement, dpi: number, issues: ValidationIssue[]): void {
  switch (element.type) {
    case 'text': {
      if (element.fontSize < MIN_LEGIBLE_FONT_MM) {
        issues.push({
          severity: 'warning',
          code: 'text/too-small',
          elementId: element.id,
          message: `Text is ${element.fontSize} mm tall. Below ${MIN_LEGIBLE_FONT_MM} mm it is hard to read at ${dpi} dpi.`,
        })
      }
      if (element.align && element.align !== 'left' && element.maxWidth === undefined) {
        issues.push({
          severity: 'warning',
          code: 'text/align-without-width',
          elementId: element.id,
          message: 'Alignment has no effect unless the text element has a width set.',
        })
      }
      break
    }

    case 'barcode': {
      validateBarcode(element, dpi, issues)
      break
    }

    case 'qrcode': {
      const moduleDots = mmToDotsExact(element.moduleWidth, dpi)
      if (moduleDots < 3) {
        issues.push({
          severity: 'warning',
          code: 'qr/small-module',
          elementId: element.id,
          message: `QR module is ${moduleDots.toFixed(1)} dots. Phone cameras struggle below 3 dots per module.`,
        })
      }
      if (element.value.length === 0) {
        issues.push({
          severity: 'error',
          code: 'qr/empty',
          elementId: element.id,
          message: 'QR code has no content.',
        })
      }
      break
    }

    case 'box':
    case 'line': {
      if (element.thickness <= 0) {
        issues.push({
          severity: 'error',
          code: 'shape/no-thickness',
          elementId: element.id,
          message: `${describe(element)} has zero thickness and will not print.`,
        })
      }
      break
    }

    case 'image': {
      if (!element.data) {
        issues.push({
          severity: 'error',
          code: 'image/empty',
          elementId: element.id,
          message: 'Image element has no data.',
        })
      }
      break
    }
  }
}

function validateBarcode(
  element: Extract<LabelElement, { type: 'barcode' }>,
  dpi: number,
  issues: ValidationIssue[],
): void {
  const moduleWidth = element.moduleWidth ?? 0.25
  const exactDots = mmToDotsExact(moduleWidth, dpi)

  if (exactDots < SAFE_MODULE_DOTS) {
    issues.push({
      severity: 'warning',
      code: 'barcode/narrow-module',
      elementId: element.id,
      message: `Narrow bar is ${exactDots.toFixed(1)} dots wide. Use at least ${SAFE_MODULE_DOTS} dots (${(SAFE_MODULE_DOTS / (dpi / 25.4)).toFixed(2)} mm) for reliable scanning.`,
    })
  }

  const error = roundingErrorMm(moduleWidth, dpi)
  if (error > 0.01) {
    const actual = mmToDots(moduleWidth, dpi)
    issues.push({
      severity: 'warning',
      code: 'barcode/module-rounding',
      elementId: element.id,
      message: `Narrow bar of ${moduleWidth} mm rounds to ${actual} dots (${(actual / (dpi / 25.4)).toFixed(3)} mm). Pick a width that lands on a whole dot to keep bar ratios consistent.`,
    })
  }

  if (element.height < 5) {
    issues.push({
      severity: 'warning',
      code: 'barcode/short',
      elementId: element.id,
      message: `Bars are ${element.height} mm tall. Short bars force the scanner to be aimed precisely; 10 mm or more is comfortable.`,
    })
  }

  const quietZone = (QUIET_ZONE_MODULES * mmToDotsExact(moduleWidth, dpi)) / (dpi / 25.4)
  if (element.x < quietZone) {
    issues.push({
      severity: 'warning',
      code: 'barcode/quiet-zone',
      elementId: element.id,
      message: `Barcode needs about ${quietZone.toFixed(1)} mm of blank space to its left; it currently has ${element.x} mm.`,
    })
  }

  const contentIssue = checkSymbologyContent(element.symbology, element.value)
  if (contentIssue) {
    // Placeholders resolve at print time, so unresolved content is not yet wrong.
    const severity: IssueSeverity = fieldsIn(element.value).length > 0 ? 'warning' : 'error'
    issues.push({
      severity,
      code: 'barcode/invalid-content',
      elementId: element.id,
      message: contentIssue,
    })
  }
}

/** Returns a message when the value cannot be encoded, or null when it can. */
export function checkSymbologyContent(symbology: LinearSymbology, value: string): string | null {
  if (value.length === 0) return 'Barcode has no content.'

  switch (symbology) {
    case 'ean13':
      return DIGITS.test(value) && (value.length === 12 || value.length === 13)
        ? null
        : 'EAN-13 needs 12 digits, or 13 including the check digit.'
    case 'ean8':
      return DIGITS.test(value) && (value.length === 7 || value.length === 8)
        ? null
        : 'EAN-8 needs 7 digits, or 8 including the check digit.'
    case 'upca':
      return DIGITS.test(value) && (value.length === 11 || value.length === 12)
        ? null
        : 'UPC-A needs 11 digits, or 12 including the check digit.'
    case 'upce':
      return DIGITS.test(value) && value.length >= 6 && value.length <= 8
        ? null
        : 'UPC-E needs 6 to 8 digits.'
    case 'itf14':
      return DIGITS.test(value) && (value.length === 13 || value.length === 14)
        ? null
        : 'ITF-14 needs 13 digits, or 14 including the check digit.'
    case 'itf':
      if (!DIGITS.test(value)) return 'Interleaved 2 of 5 encodes digits only.'
      return value.length % 2 === 0
        ? null
        : 'Interleaved 2 of 5 needs an even number of digits; the printer will pad with a leading zero.'
    case 'msi':
      return DIGITS.test(value) ? null : 'MSI encodes digits only.'
    case 'code39':
      return CODE39_ALPHABET.test(value)
        ? null
        : 'Code 39 encodes A–Z, 0–9, space and - . $ / + % only. Lowercase is not supported.'
    case 'codabar':
      return CODABAR_ALPHABET.test(value)
        ? null
        : 'Codabar must start and end with a letter A–D and otherwise contain digits or - $ : / . +'
    case 'code93':
    case 'code128':
    case 'gs1-128':
      return null
  }
}

/**
 * Check that every `{{field}}` the element references exists in the record
 * about to be printed.
 *
 * Only runs when data is supplied — while designing there is no record yet, and
 * an unresolved placeholder is the normal state rather than a problem. At print
 * time it is the opposite: a missing field silently becomes an empty string, so
 * a whole run can come out with a blank where the lot number should be.
 */
function validateBindings(
  element: LabelElement,
  data: DataRecord | undefined,
  issues: ValidationIssue[],
): void {
  if (!data) return

  const value = bindableValue(element)
  if (value === null) return

  for (const field of fieldsIn(value)) {
    if (!(field in data)) {
      issues.push({
        severity: 'warning',
        code: 'binding/missing-field',
        elementId: element.id,
        message: `${describe(element)} references "${field}", which is not in the data. It will print blank.`,
      })
      continue
    }
    const bound = data[field]
    if (bound === null || bound === undefined || String(bound).trim() === '') {
      issues.push({
        severity: element.type === 'barcode' ? 'error' : 'warning',
        code: 'binding/empty-value',
        elementId: element.id,
        message: `${describe(element)} references "${field}", which is empty in the data.`,
      })
    }
  }
}

/** The single string field that participates in binding, or null if none does. */
function bindableValue(element: LabelElement): string | null {
  switch (element.type) {
    case 'text':
    case 'barcode':
    case 'qrcode':
      return element.value
    default:
      return null
  }
}

function describe(element: LabelElement): string {
  return element.name ?? element.type.charAt(0).toUpperCase() + element.type.slice(1)
}
