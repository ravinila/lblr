/**
 * Keeping an installed copy current.
 *
 * On launch the app asks GitHub for the latest release manifest. If it names
 * a newer signed installer, a bar appears under the toolbar offering to
 * download it and restart. Nothing is downloaded until the person says so,
 * and a failed check is silent: an offline machine should not nag.
 */

import { useEffect, useState } from 'react'

import { isDesktop } from '../lib/backend.js'

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; version: string; notes?: string }
  | { kind: 'downloading'; received: number; total: number | null }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string }

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isDesktop()) return
    let live = true
    void (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (live && update) {
          setPhase({
            kind: 'available',
            version: update.version,
            ...(update.body ? { notes: update.body } : {}),
          })
        }
      } catch {
        // No network, or no manifest yet: say nothing.
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const install = async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) return
      let received = 0
      let total: number | null = null
      setPhase({ kind: 'downloading', received, total })
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength
          setPhase({ kind: 'downloading', received, total })
        } else if (event.event === 'Finished') {
          setPhase({ kind: 'ready' })
        }
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (error) {
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  if (dismissed || phase.kind === 'idle') return null

  return (
    <div className="update-banner" role="status">
      {phase.kind === 'available' ? (
        <>
          <span>
            <strong>lblr {phase.version}</strong> is available.
          </span>
          <button className="btn btn-primary" onClick={install}>
            Update and restart
          </button>
          <button className="btn btn-ghost" onClick={() => setDismissed(true)}>
            Not now
          </button>
        </>
      ) : null}
      {phase.kind === 'downloading' ? (
        <span>
          Downloading the update…{' '}
          {phase.total ? `${Math.round((phase.received / phase.total) * 100)}%` : ''}
        </span>
      ) : null}
      {phase.kind === 'ready' ? <span>Installing and restarting…</span> : null}
      {phase.kind === 'failed' ? (
        <>
          <span className="note-error">The update could not be installed: {phase.message}</span>
          <button className="btn btn-ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </>
      ) : null}
    </div>
  )
}
