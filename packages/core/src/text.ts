/**
 * Text layout that the designer and both compilers share.
 *
 * Line breaking is done here, once, and never left to the printer. Firmware
 * "block" commands wrap by their own rules, and on at least one printer they
 * split words mid-way and print the lines on top of each other. The canvas
 * and the printer must agree on where a line ends, and the only way to be
 * certain is for both to use the same function.
 *
 * The width estimate is deliberately simple: one character is a fixed
 * fraction of the cap height. The internal fonts are condensed grotesques
 * with fairly even advances, and a plain rule that both sides share beats a
 * precise one that only the canvas knows.
 */

import { box, text } from './elements.js'
import { layoutSize, stockLayout } from './layout.js'
import { createTemplate } from './template.js'
import type { LabelTemplate, MediaSpec, Mm, TextElement } from './types.js'

/**
 * Width of one character relative to its cap height in the printers'
 * internal scalable font. Measured from print samples rather than a font
 * metric table.
 */
export const TEXT_ASPECT = 0.6

/** Extra space between lines when the element does not say. */
export function lineGapFor(element: Pick<TextElement, 'fontSize' | 'lineGap'>): Mm {
  return element.lineGap ?? element.fontSize * 0.3
}

/** Baseline-to-baseline distance between wrapped lines. */
export function linePitch(element: Pick<TextElement, 'fontSize' | 'lineGap'>): Mm {
  return element.fontSize + lineGapFor(element)
}

/** Estimated printed width of one line at a given cap height. */
export function textLineWidth(line: string, fontSize: Mm): Mm {
  return line.length * fontSize * TEXT_ASPECT
}

/**
 * Break a value into the lines it prints as. Paragraphs (newlines) always
 * break; with a wrap width, words fold onto the next line and a word longer
 * than a line is cut where the line ends.
 */
export function wrapText(value: string, fontSize: Mm, maxWidth?: Mm): string[] {
  const paragraphs = value.split('\n')
  if (maxWidth === undefined || maxWidth <= 0) return paragraphs

  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * TEXT_ASPECT)))
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    let current = ''
    for (const word of paragraph.split(' ')) {
      let rest = word
      while (rest.length > perLine) {
        if (current) {
          lines.push(current)
          current = ''
        }
        lines.push(rest.slice(0, perLine))
        rest = rest.slice(perLine)
      }
      const candidate = current ? `${current} ${rest}` : rest
      if (candidate.length <= perLine) {
        current = candidate
      } else {
        lines.push(current)
        current = rest
      }
    }
    lines.push(current)
  }
  return lines
}

/** How far a line starts from the element's left edge, for centred and right-aligned blocks. */
export function lineOffset(element: TextElement, line: string): Mm {
  if (!element.maxWidth || !element.align || element.align === 'left') return 0
  const slack = Math.max(0, element.maxWidth - textLineWidth(line, element.fontSize))
  return element.align === 'center' ? slack / 2 : slack
}

/**
 * Correction for a printer whose built-in font prints larger or smaller than
 * the dot size it is asked for. Both factors multiply the size arguments sent
 * with every text; 1 means the printer draws what it is told.
 */
export interface TextScale {
  height: number
  width: number
}

export const NO_TEXT_SCALE: TextScale = { height: 1, width: 1 }

/** True when the correction is close enough to none to be reported as none. */
export function isUnscaled(scale: TextScale | undefined): boolean {
  return !scale || (Math.abs(scale.height - 1) < 0.01 && Math.abs(scale.width - 1) < 0.01)
}

/**
 * The test label used to measure a printer's text: a box whose size is known
 * exactly, because it is drawn in dots, and a row of digits whose intended
 * size is known. Measuring the printed digits against the intended size gives
 * the correction.
 */
export interface TextCalibrationSpec {
  digits: string
  /** Outline box, so the person can confirm the dots themselves are right. */
  boxWidth: Mm
  boxHeight: Mm
  /** Cap height the digits are asked for. */
  capHeight: Mm
  /** Width the whole digit row should come out at. */
  expectedWidth: Mm
}

const DIGITS = '0123456789'

export function textCalibrationSpec(
  media: Pick<MediaSpec, 'width' | 'height'>,
): TextCalibrationSpec {
  const margin = 2
  const boxWidth = round(Math.min(20, media.width - margin * 2))
  const boxHeight = round(Math.min(10, (media.height - margin * 3) / 2))
  // The digit row must fit the label width and the space under the box.
  const capHeight = round(
    Math.max(
      1,
      Math.min(
        4,
        (media.width - margin * 2) / (DIGITS.length * TEXT_ASPECT),
        media.height - boxHeight - margin * 3,
      ),
    ),
  )
  return {
    digits: DIGITS,
    boxWidth,
    boxHeight,
    capHeight,
    expectedWidth: round(textLineWidth(DIGITS, capHeight)),
  }
}

/**
 * The label to print for the measurement, on the given stock.
 *
 * It covers one whole pass as a single cell rather than being stamped into
 * every column: a printer that draws text at twice the size would otherwise
 * run the digits of one cell into the digits of the next, and there would be
 * nothing left to measure.
 */
export function textCalibrationTemplate(media: MediaSpec): LabelTemplate {
  const spec = textCalibrationSpec(media)
  const pass = layoutSize(media, stockLayout(media))
  const margin = 2
  return createTemplate({
    name: 'Text size check',
    width: pass.width,
    height: media.height,
    gap: media.gap,
    columns: 1,
    mediaType: media.type,
    elements: [
      box({ x: margin, y: margin, width: spec.boxWidth, height: spec.boxHeight, thickness: 0.3 }),
      text({
        x: margin,
        y: margin * 2 + spec.boxHeight,
        value: spec.digits,
        fontSize: spec.capHeight,
      }),
    ],
  })
}

/** The correction implied by what the ruler says the digits measure. */
export function textScaleFromMeasurement(
  spec: TextCalibrationSpec,
  measuredHeight: Mm,
  measuredWidth: Mm,
): TextScale {
  const clamp = (value: number) => Math.min(5, Math.max(0.2, value))
  return {
    height: clamp(spec.capHeight / measuredHeight),
    width: clamp(spec.expectedWidth / measuredWidth),
  }
}

function round(mm: number): number {
  return Math.round(mm * 10) / 10
}
