/**
 * The bridge to the Rust side.
 *
 * Everything above this file is an ordinary web app: the label model and both
 * compilers are plain TypeScript. Only the last step — handing bytes to a
 * printer — needs native code.
 *
 * Running `vite dev` in a plain browser is a genuinely useful way to work on
 * the canvas, so every call degrades to a clearly-labelled stub rather than
 * throwing. The stubs announce themselves; nothing here pretends a label was
 * printed when it was not.
 */

export interface PrinterInfo {
  name: string
  driver: string
  port: string
  isDefault: boolean
  status: string
}

export type Destination =
  | { kind: 'printer'; name: string }
  | { kind: 'network'; host: string; port: number }
  | { kind: 'file'; path: string }

/** True when running inside the Tauri shell rather than a bare browser tab. */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

const DEMO_PRINTERS: PrinterInfo[] = [
  {
    name: 'TVS LP 46 Neo (preview)',
    driver: 'browser preview — no printer attached',
    port: 'USB001',
    isDefault: true,
    status: 'ready',
  },
]

export async function listPrinters(): Promise<PrinterInfo[]> {
  if (!isDesktop()) return DEMO_PRINTERS
  return invoke<PrinterInfo[]>('list_printers')
}

export async function defaultPrinter(): Promise<string | null> {
  if (!isDesktop()) return DEMO_PRINTERS[0]?.name ?? null
  return invoke<string | null>('default_printer')
}

export async function probeNetworkPrinter(host: string, port: number): Promise<boolean> {
  if (!isDesktop()) return false
  return invoke<boolean>('probe_network_printer', { host, port })
}

export async function printJob(
  destination: Destination,
  commands: string,
  jobName: string,
): Promise<void> {
  if (!isDesktop()) {
    throw new Error('Printing needs the desktop app. Run `pnpm dev` instead of the browser preview.')
  }
  return invoke<void>('print_job', { destination, commands, jobName })
}

/** Ask for a path to save to. Returns null when the person cancels. */
export async function chooseSavePath(defaultName: string): Promise<string | null> {
  if (!isDesktop()) return null
  const { save } = await import('@tauri-apps/plugin-dialog')
  return save({
    defaultPath: defaultName,
    filters: [{ name: 'Label template', extensions: ['lblr', 'json'] }],
  })
}

export async function chooseOpenPath(): Promise<string | null> {
  if (!isDesktop()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({
    multiple: false,
    filters: [{ name: 'Label template', extensions: ['lblr', 'json'] }],
  })
  return typeof picked === 'string' ? picked : null
}

export async function readTextFile(path: string): Promise<string> {
  const { readTextFile: read } = await import('@tauri-apps/plugin-fs')
  return read(path)
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  const { writeTextFile: write } = await import('@tauri-apps/plugin-fs')
  return write(path, contents)
}
