/** Everything this package throws, so callers can catch one type. */
export class TransportError extends Error {
  readonly host?: string
  readonly port?: number
  readonly path?: string

  constructor(
    message: string,
    context: { host?: string; port?: number; path?: string; cause?: unknown } = {},
  ) {
    // Keep the underlying errno on `cause`: the message says what we were
    // trying to do, the cause says what the OS reported.
    super(message, context.cause === undefined ? undefined : { cause: context.cause })
    this.name = 'TransportError'
    if (context.host !== undefined) this.host = context.host
    if (context.port !== undefined) this.port = context.port
    if (context.path !== undefined) this.path = context.path
  }
}
