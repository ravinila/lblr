/**
 * A thin, typed writer for TSPL commands.
 *
 * Every method corresponds to one command in the TSPL/TSPL2 reference, takes
 * dots rather than millimetres, and does nothing clever. Unit conversion,
 * defaulting and layout decisions all belong to the compiler; this file's only
 * job is to produce syntactically correct lines.
 */

export type TsplRotation = 0 | 90 | 180 | 270

/** TSPL string literals are double-quoted, with backslash as the escape. */
export function escapeTsplString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export class TsplBuilder {
  private readonly lines: string[] = []

  /** Append a raw command line. Useful for commands not yet wrapped here. */
  raw(line: string): this {
    this.lines.push(line)
    return this
  }

  comment(text: string): this {
    // TSPL has no comment syntax; these are stripped before transmission and
    // exist only to make the debug view readable.
    return this.raw(`; ${text}`)
  }

  // --- media setup -------------------------------------------------------

  size(widthMm: number, heightMm: number): this {
    return this.raw(`SIZE ${mm(widthMm)} mm, ${mm(heightMm)} mm`)
  }

  /** Die-cut stock: the printer looks for a light gap between labels. */
  gap(gapMm: number, offsetMm = 0): this {
    return this.raw(`GAP ${mm(gapMm)} mm, ${mm(offsetMm)} mm`)
  }

  /** Continuous stock: no gap detection at all. */
  gapNone(): this {
    return this.raw('GAP 0 mm, 0 mm')
  }

  /** Black-mark stock: the printer looks for a dark bar on the liner. */
  bline(markMm: number, offsetMm = 0): this {
    return this.raw(`BLINE ${mm(markMm)} mm, ${mm(offsetMm)} mm`)
  }

  direction(direction: 0 | 1, mirror: 0 | 1 = 0): this {
    return this.raw(`DIRECTION ${direction},${mirror}`)
  }

  /** Shifts the origin. Used to correct stock that sits off-centre. */
  reference(xDots: number, yDots: number): this {
    return this.raw(`REFERENCE ${xDots},${yDots}`)
  }

  /** Inches per second. */
  speed(ips: number): this {
    return this.raw(`SPEED ${ips}`)
  }

  /** Burn darkness, 0–15. */
  density(level: number): this {
    return this.raw(`DENSITY ${clamp(Math.round(level), 0, 15)}`)
  }

  /**
   * Select UTF-8 so non-ASCII text prints correctly. Firmware that predates
   * this argument ignores the line rather than faulting.
   */
  codepageUtf8(): this {
    return this.raw('CODEPAGE UTF-8')
  }

  /** Clear the image buffer. Must precede the drawing commands for each label. */
  cls(): this {
    return this.raw('CLS')
  }

  // --- drawing -----------------------------------------------------------

  /**
   * Single-line text.
   *
   * Font "0" is the internal scalable face, for which the multiplication
   * arguments are the glyph width and height in dots rather than integer
   * multipliers — which is what lets millimetre sizing survive to the printer.
   */
  text(
    xDots: number,
    yDots: number,
    content: string,
    options: { widthDots: number; heightDots: number; rotation?: TsplRotation; font?: string },
  ): this {
    const font = options.font ?? '0'
    const rotation = options.rotation ?? 0
    return this.raw(
      `TEXT ${xDots},${yDots},"${font}",${rotation},${options.widthDots},${options.heightDots},"${escapeTsplString(content)}"`,
    )
  }

  /**
   * Wrapping text within a fixed box.
   *
   * The trailing alignment argument is a TSPL2 addition; older firmware reads
   * the command without it, which is why the compiler only emits BLOCK when the
   * element actually asks for a width.
   */
  block(
    xDots: number,
    yDots: number,
    widthDots: number,
    heightDots: number,
    content: string,
    options: {
      fontWidthDots: number
      fontHeightDots: number
      rotation?: TsplRotation
      lineSpacingDots?: number
      align?: 0 | 1 | 2 | 3
      font?: string
    },
  ): this {
    const font = options.font ?? '0'
    const rotation = options.rotation ?? 0
    const spacing = options.lineSpacingDots ?? 0
    const align = options.align ?? 0
    return this.raw(
      `BLOCK ${xDots},${yDots},${widthDots},${heightDots},"${font}",${rotation},` +
        `${options.fontWidthDots},${options.fontHeightDots},${spacing},${align},` +
        `"${escapeTsplString(content)}"`,
    )
  }

  barcode(
    xDots: number,
    yDots: number,
    type: string,
    content: string,
    options: {
      heightDots: number
      narrowDots: number
      wideDots: number
      humanReadable?: 0 | 1 | 2 | 3
      rotation?: TsplRotation
    },
  ): this {
    const readable = options.humanReadable ?? 0
    const rotation = options.rotation ?? 0
    return this.raw(
      `BARCODE ${xDots},${yDots},"${type}",${options.heightDots},${readable},${rotation},` +
        `${options.narrowDots},${options.wideDots},"${escapeTsplString(content)}"`,
    )
  }

  /**
   * `cellDots` is the module size and the firmware caps it at 10, which puts a
   * hard ceiling on how large a QR code can be printed by this command.
   */
  qrcode(
    xDots: number,
    yDots: number,
    content: string,
    options: {
      cellDots: number
      errorCorrection?: 'L' | 'M' | 'Q' | 'H'
      rotation?: TsplRotation
    },
  ): this {
    const ecc = options.errorCorrection ?? 'M'
    const rotation = options.rotation ?? 0
    const cell = clamp(Math.round(options.cellDots), 1, 10)
    return this.raw(
      `QRCODE ${xDots},${yDots},${ecc},${cell},A,${rotation},"${escapeTsplString(content)}"`,
    )
  }

  /** A filled rectangle. TSPL draws lines as bars rather than strokes. */
  bar(xDots: number, yDots: number, widthDots: number, heightDots: number): this {
    return this.raw(`BAR ${xDots},${yDots},${widthDots},${heightDots}`)
  }

  /** An outlined rectangle, given by opposite corners. */
  box(
    xDots: number,
    yDots: number,
    xEndDots: number,
    yEndDots: number,
    thicknessDots: number,
  ): this {
    return this.raw(`BOX ${xDots},${yDots},${xEndDots},${yEndDots},${thicknessDots}`)
  }

  // --- output ------------------------------------------------------------

  /** `sets` is how many labels; `copies` is how many of each. */
  print(sets: number, copies = 1): this {
    return this.raw(`PRINT ${Math.max(1, Math.round(sets))},${Math.max(1, Math.round(copies))}`)
  }

  /** The command stream, comments included, for inspection in the UI. */
  toDebugString(): string {
    return this.lines.join('\n')
  }

  /**
   * The bytes to send to the printer. Comments are stripped and lines are
   * terminated with CRLF, which is what TSPL firmware expects.
   */
  toString(): string {
    return (
      this.lines
        .filter((line) => !line.startsWith('; '))
        .join('\r\n') + '\r\n'
    )
  }
}

function mm(value: number): string {
  // Two decimals is the finest granularity TSPL accepts for millimetre
  // arguments, and trailing zeroes make diffs between jobs noisy.
  return Number(value.toFixed(2)).toString()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
