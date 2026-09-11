/**
 * Choosing where a job goes, and sending it.
 *
 * The compiled command stream is shown rather than hidden. When a label comes
 * out wrong the first question is always what was actually sent, and having it
 * on screen next to the destination turns a support conversation into a copy
 * and paste.
 */

import { useEffect, useState } from 'react'

import {
  defaultPrinter,
  isDesktop,
  listPrinters,
  printJob,
  probeNetworkPrinter,
  type Destination,
  type PrinterInfo,
} from '../lib/backend.js'

type Target = 'printer' | 'network' | 'file'

export interface PrintDialogProps {
  jobName: string
  commands: string
  warnings: string[]
  blocked: boolean
  onClose: () => void
}

export function PrintDialog({
  jobName,
  commands,
  warnings,
  blocked,
  onClose,
}: PrintDialogProps) {
  const [target, setTarget] = useState<Target>('printer')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState('')
  const [host, setHost] = useState('192.168.1.50')
  const [port, setPort] = useState(9100)
  const [path, setPath] = useState('label.prn')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const [found, fallback] = await Promise.all([listPrinters(), defaultPrinter()])
        if (!live) return
        setPrinters(found)
        setPrinter(fallback ?? found[0]?.name ?? '')
      } catch (error) {
        if (live) setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const destination = (): Destination => {
    switch (target) {
      case 'printer':
        return { kind: 'printer', name: printer }
      case 'network':
        return { kind: 'network', host, port }
      case 'file':
        return { kind: 'file', path }
    }
  }

  const send = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await printJob(destination(), commands, jobName)
      setStatus(target === 'file' ? `Written to ${path}` : 'Sent to the printer')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const reachable = await probeNetworkPrinter(host, port)
      setStatus(
        reachable
          ? `${host}:${port} is listening`
          : `Nothing answered on ${host}:${port}. Check the printer is on and on this network.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const failed = status !== null && !/Sent|Written|listening/.test(status)

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Print"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog">
        <header>
          <h2>Print {jobName}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="body">
          <label className="field">
            <span>Send to</span>
            <select value={target} onChange={(event) => setTarget(event.target.value as Target)}>
              <option value="printer">A printer on this computer</option>
              <option value="network">A printer on the network</option>
              <option value="file">A file</option>
            </select>
          </label>

          {target === 'printer' ? (
            <label className="field">
              <span>Printer</span>
              <select value={printer} onChange={(event) => setPrinter(event.target.value)}>
                {printers.length === 0 ? <option value="">No printers found</option> : null}
                {printers.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                    {item.status && item.status !== 'ready' ? ` — ${item.status}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {target === 'network' ? (
            <>
              <label className="field">
                <span>Address</span>
                <input value={host} onChange={(event) => setHost(event.target.value)} />
              </label>
              <label className="field">
                <span>Port</span>
                <input
                  type="number"
                  value={port}
                  onChange={(event) => setPort(Number(event.target.value) || 9100)}
                />
              </label>
              <div>
                <button className="btn" onClick={test} disabled={busy}>
                  Test connection
                </button>
              </div>
            </>
          ) : null}

          {target === 'file' ? (
            <label className="field">
              <span>File</span>
              <input value={path} onChange={(event) => setPath(event.target.value)} />
            </label>
          ) : null}

          {warnings.length > 0 ? (
            <p className="note">
              {warnings.length === 1
                ? warnings[0]
                : `${warnings.length} things were approximated while compiling. See the command stream below.`}
            </p>
          ) : null}

          {!isDesktop() ? (
            <p className="note">
              This is the browser preview, so nothing can reach a printer. Run the desktop app to
              print.
            </p>
          ) : null}

          {status ? <p className={failed ? 'note note-error' : 'note'}>{status}</p> : null}

          <pre className="code">{commands}</pre>
        </div>

        <footer>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={send} disabled={busy || blocked}>
            {blocked ? 'Fix errors first' : busy ? 'Sending…' : 'Print'}
          </button>
        </footer>
      </div>
    </div>
  )
}
