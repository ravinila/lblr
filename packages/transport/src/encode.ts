/**
 * Turning command text into the bytes a printer actually receives.
 *
 * TSPL and ZPL are byte protocols, not Unicode ones: the printer interprets
 * each byte through whatever code page is currently selected. The selection is
 * part of the command stream, and both of our compilers make it explicitly —
 * TSPL emits `CODEPAGE UTF-8`, ZPL emits `^CI28` — so the stream that follows
 * must be UTF-8, and that is the default here.
 *
 * The legacy code pages stay available for printers pinned to one in firmware,
 * or for hand-written command streams that select a different page. Latin-1 is
 * the useful one: it maps one character to one byte across U+0000–U+00FF, which
 * lines up with code page 850/1252 over the accented characters people actually
 * put on labels.
 *
 * Getting this wrong is quiet rather than loud. Send UTF-8 to a printer
 * expecting CP850 and `é` arrives as two bytes and prints as two glyphs.
 */

/** Code pages we can encode to without shipping a conversion table. */
export type CommandEncoding = 'utf8' | 'latin1' | 'ascii'

/** What the compilers select on the printer, and so what we send by default. */
export const DEFAULT_ENCODING: CommandEncoding = 'utf8'

export class EncodingError extends Error {
  constructor(
    message: string,
    readonly character: string,
    readonly index: number,
  ) {
    super(message)
    this.name = 'EncodingError'
  }
}

/**
 * Encode a command stream for transmission.
 *
 * The single-byte encodings throw rather than substituting, because a
 * replacement character in a barcode payload produces a label that scans as the
 * wrong value — far worse than a failed print the operator can see and correct.
 */
export function encodeCommands(
  commands: string,
  encoding: CommandEncoding = DEFAULT_ENCODING,
): Uint8Array {
  if (encoding === 'utf8') {
    return new TextEncoder().encode(commands)
  }

  const limit = encoding === 'ascii' ? 0x7f : 0xff
  const bytes = new Uint8Array(commands.length)

  for (let i = 0; i < commands.length; i++) {
    const code = commands.charCodeAt(i)
    if (code > limit) {
      throw new EncodingError(
        `character ${JSON.stringify(commands[i])} (U+${code
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}) at index ${i} cannot be encoded as ${encoding}; ` +
          'select a printer code page that contains it, or remove it from the label',
        commands[i] ?? '',
        i,
      )
    }
    bytes[i] = code
  }

  return bytes
}

/** Accept either already-encoded bytes or command text from a compiler. */
export function toBytes(
  payload: string | Uint8Array,
  encoding: CommandEncoding = DEFAULT_ENCODING,
): Uint8Array {
  return typeof payload === 'string' ? encodeCommands(payload, encoding) : payload
}
