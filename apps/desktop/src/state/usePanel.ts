/**
 * A side panel's width and whether it is open, remembered per machine.
 *
 * Layout preferences are not part of the document, so they live in local
 * storage rather than the session, and a missing or corrupt value simply
 * falls back to the default.
 */

import { useCallback, useEffect, useState } from 'react'

export interface PanelState {
  width: number
  open: boolean
}

export interface PanelControls {
  setWidth: (width: number) => void
  toggle: () => void
  reset: () => void
}

export function usePanel(
  key: string,
  defaults: { width: number; min: number; max: number },
): [PanelState, PanelControls] {
  const [state, setState] = useState<PanelState>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(key) ?? 'null',
      ) as Partial<PanelState> | null
      const width = Number(stored?.width)
      return {
        width: width >= defaults.min && width <= defaults.max ? width : defaults.width,
        open: stored?.open !== false,
      }
    } catch {
      return { width: defaults.width, open: true }
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // A forgotten panel size is not worth a crash.
    }
  }, [key, state])

  const setWidth = useCallback(
    (width: number) =>
      setState((current) => ({
        ...current,
        width: Math.min(defaults.max, Math.max(defaults.min, Math.round(width))),
      })),
    [defaults.max, defaults.min],
  )
  const toggle = useCallback(() => setState((current) => ({ ...current, open: !current.open })), [])
  const reset = useCallback(
    () => setState((current) => ({ ...current, width: defaults.width })),
    [defaults.width],
  )

  return [state, { setWidth, toggle, reset }]
}
