/**
 * A thin, typed writer for ZPL II commands.
 *
 * As with the TSPL builder, everything here takes dots and makes no layout
 * decisions. ZPL's quirk is that `^` and `~` introduce commands, so any field
 * data containing them has to be hex-escaped — `field()` handles that rather
 * than leaving it to callers to remember.
 */

/** ZPL encodes rotation as a letter on the command that draws the field. */
export type ZplOrientation = 'N' | 'R' | 'I' | 'B'

export function orientationFor(rotation: number | undefined): ZplOrientation {
  switch (rotation ?? 0) {
    case 90:
      return 'R'
    case 180:
      return 'I'
    case 270:
      return 'B'
    default:
      return 'N'
  }
}

/** True when the value contains characters ZPL would read as command prefixes. */
export function needsHexEscape(value: string): boolean {
  return /[\^~\\]/.test(value)
}

/**
 * Escape `^`, `~` and `\` using ZPL's `_XX` hex notation, which the printer
 * only interprets once `^FH` has been sent for the field.
 */
export function hexEscape(value: string): string {
  return value.replace(/[\^~\\]/g, (char) => `_${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

export class ZplBuilder {
  private readonly lines: string[] = []

  raw(line: string): this {
    this.lines.push(line)
    return this
  }

  /** ZPL comments are a real command, so these survive to the printer harmlessly. */
  comment(text: string): this {
    return this.raw(`^FX ${text.replace(/[\^~]/g, '')}^FS`)
  }

  // --- label envelope ----------------------------------------------------

  start(): this {
    return this.raw('^XA')
  }

  end(): this {
    return this.raw('^XZ')
  }

  /** Print width in dots. Anything wider than this is clipped by the printer. */
  printWidth(dots: number): this {
    return this.raw(`^PW${Math.round(dots)}`)
  }

  /** Label length in dots. */
  labelLength(dots: number): this {
    return this.raw(`^LL${Math.round(dots)}`)
  }

  /** Label home position — ZPL's equivalent of TSPL's REFERENCE. */
  labelHome(xDots: number, yDots: number): this {
    return this.raw(`^LH${Math.round(xDots)},${Math.round(yDots)}`)
  }

  /**
   * Absolute darkness, 0–30.
   *
   * This is `~SD`, which persists in the printer's settings rather than
   * applying to one label only — the same behaviour as TSPL's DENSITY.
   */
  darkness(level: number): this {
    return this.raw(`~SD${clamp(Math.round(level), 0, 30)}`)
  }

  /** Print rate in inches per second. */
  printRate(ips: number): this {
    return this.raw(`^PR${clamp(Math.round(ips), 1, 14)}`)
  }

  /** Media tracking: Y web/gap sensing, M black mark, N continuous. */
  mediaTracking(mode: 'Y' | 'M' | 'N'): this {
    return this.raw(`^MN${mode}`)
  }

  /** Select UTF-8 for field data. */
  encodingUtf8(): this {
    return this.raw('^CI28')
  }

  // --- drawing -----------------------------------------------------------

  origin(xDots: number, yDots: number): this {
    return this.raw(`^FO${Math.round(xDots)},${Math.round(yDots)}`)
  }

  /** Scalable font 0, sized in dots. Height first, then width. */
  font(heightDots: number, widthDots: number, orientation: ZplOrientation = 'N'): this {
    return this.raw(`^A0${orientation},${Math.round(heightDots)},${Math.round(widthDots)}`)
  }

  /**
   * Field block: wraps text to `widthDots` and aligns it.
   * Must be emitted between the origin and the field data.
   */
  fieldBlock(
    widthDots: number,
    maxLines: number,
    lineSpacingDots: number,
    align: 'L' | 'C' | 'R' | 'J',
  ): this {
    return this.raw(
      `^FB${Math.round(widthDots)},${maxLines},${Math.round(lineSpacingDots)},${align},0`,
    )
  }

  /** Field data, hex-escaped and terminated. */
  field(value: string): this {
    if (needsHexEscape(value)) {
      return this.raw(`^FH^FD${hexEscape(value)}^FS`)
    }
    return this.raw(`^FD${value}^FS`)
  }

  /** Barcode defaults: narrow module width, wide-to-narrow ratio, height. */
  barcodeDefaults(narrowDots: number, ratio: number, heightDots: number): this {
    const safeRatio = clamp(Number(ratio.toFixed(1)), 2, 3)
    return this.raw(
      `^BY${Math.max(1, Math.round(narrowDots))},${safeRatio},${Math.round(heightDots)}`,
    )
  }

  /** Emit a bare barcode command; the caller follows it with `field()`. */
  barcode(command: string): this {
    return this.raw(command)
  }

  /**
   * QR code. ZPL carries the error correction level and mask in the field data
   * rather than the command, which is why the data is written here rather than
   * through `field()`.
   */
  qrcode(
    content: string,
    options: { magnification: number; errorCorrection?: 'L' | 'M' | 'Q' | 'H'; orientation?: ZplOrientation },
  ): this {
    const ecc = options.errorCorrection ?? 'M'
    const orientation = options.orientation ?? 'N'
    const magnification = clamp(Math.round(options.magnification), 1, 10)
    this.raw(`^BQ${orientation},2,${magnification}`)
    // "A" selects automatic mask; the data follows after the comma.
    return this.raw(`^FD${ecc}A,${hexEscape(content)}^FS`)
  }

  /** Graphic box. A thickness equal to the box size fills it. */
  graphicBox(widthDots: number, heightDots: number, thicknessDots: number): this {
    return this.raw(
      `^GB${Math.round(widthDots)},${Math.round(heightDots)},${Math.max(1, Math.round(thicknessDots))}^FS`,
    )
  }

  /** Quantity to print. */
  quantity(count: number): this {
    return this.raw(`^PQ${Math.max(1, Math.round(count))}`)
  }

  toDebugString(): string {
    return this.lines.join('\n')
  }

  toString(): string {
    return this.lines.join('\r\n') + '\r\n'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
