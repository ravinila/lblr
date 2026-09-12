/**
 * Designer state.
 *
 * A reducer rather than a store library: the whole editable world is one
 * `LabelTemplate` plus a selection, and undo is then just a stack of previous
 * templates. Keeping the document in the shape the compilers already accept
 * means saving, printing and previewing never need a translation step.
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  NO_TEXT_SCALE,
  barcode,
  box,
  createTemplate,
  elementId,
  line,
  parseTemplate,
  qrcode,
  serializeTemplate,
  text,
  templateFields,
  blankRecord,
  type DataRecord,
  type LabelElement,
  type LabelTemplate,
  type MediaSpec,
  type PrintDefaults,
  type TextScale,
} from '@lblr/core'

export type PrinterLanguage = 'tspl' | 'zpl'

/**
 * Zoom is screen pixels per printer dot. 1 is the honest view; the ladder the
 * buttons and shortcuts climb is coarse on purpose so a few presses cover the
 * whole useful range, while the wheel moves smoothly between rungs.
 */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 32
export const ZOOM_DEFAULT = 4
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/** The next rung of the ladder above (or below) the current zoom. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const epsilon = 1e-6
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > zoom + epsilon) ?? ZOOM_MAX
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - epsilon) ?? ZOOM_MIN
}

/** "4×", "1.5×", "0.75×": as many decimals as the value needs and no more. */
export function formatZoom(zoom: number): string {
  return `${Number(zoom.toFixed(2))}×`
}

export interface DesignerState {
  template: LabelTemplate
  selectedId: string | null
  language: PrinterLanguage
  dpi: number
  zoom: number
  /** Sample values for `{{field}}` placeholders, so the canvas shows real text. */
  sample: Record<string, string>
  /**
   * How much each printer language's font needs correcting, measured with the
   * text size check. A property of the printer, not the label, so it lives
   * here rather than in the template.
   */
  textScale: Record<PrinterLanguage, TextScale>
  /** One record per label to print in a batch. Kept apart from the template. */
  records: DataRecord[]
  /** Row of the sheet shown on the canvas instead of the sample values. */
  previewRow: number | null
  past: LabelTemplate[]
  future: LabelTemplate[]
  dirty: boolean
  /** Where the template was last opened from or saved to. */
  path: string | null
}

export type DesignerAction =
  | { type: 'add'; element: LabelElement }
  | { type: 'update'; id: string; patch: Partial<LabelElement> }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; id: string; direction: 'up' | 'down' }
  | { type: 'arrange'; id: string; index: number }
  | { type: 'select'; id: string | null }
  | { type: 'media'; patch: Partial<MediaSpec> }
  | { type: 'defaults'; patch: Partial<PrintDefaults> }
  | { type: 'rename'; name: string }
  | { type: 'language'; language: PrinterLanguage }
  | { type: 'dpi'; dpi: number }
  | { type: 'zoom'; zoom: number }
  | { type: 'sample'; field: string; value: string }
  | { type: 'textScale'; language: PrinterLanguage; scale: TextScale }
  | { type: 'records'; records: DataRecord[] }
  | { type: 'cell'; row: number; field: string; value: string }
  | { type: 'addRow' }
  | { type: 'removeRow'; row: number }
  | { type: 'previewRow'; row: number | null }
  | { type: 'load'; template: LabelTemplate; path: string | null }
  | { type: 'new'; template: LabelTemplate }
  | { type: 'saved'; path: string }
  | { type: 'undo' }
  | { type: 'redo' }

/** A first label worth looking at: the shape of a part tag people actually print. */
function starterTemplate(): LabelTemplate {
  return createTemplate({
    name: 'Part tag',
    width: 50,
    height: 25,
    gap: 2,
    elements: [
      text({ x: 3, y: 2.5, value: '{{name}}', fontSize: 3.2, bold: true }),
      text({ x: 3, y: 6.5, value: '{{sku}}', fontSize: 2.4 }),
      barcode({
        x: 3,
        y: 10,
        value: '{{sku}}',
        symbology: 'code128',
        height: 9,
        humanReadable: true,
      }),
    ],
  })
}

const MAX_UNDO = 60

/**
 * The document survives a restart. Closing the app mid-design and finding the
 * sample label again is the kind of thing that makes a tool feel disposable,
 * so the template, its sample values and the printer choice are kept in the
 * WebView's storage and restored on launch. The file path is kept too, so
 * Save goes back to the same file.
 */
const SESSION_KEY = 'lblr.session.v1'

interface StoredSession {
  template: string
  language: PrinterLanguage
  dpi: number
  sample: Record<string, string>
  textScale?: Record<PrinterLanguage, TextScale>
  records?: DataRecord[]
  path: string | null
  dirty: boolean
}

const UNSCALED: Record<PrinterLanguage, TextScale> = { tspl: NO_TEXT_SCALE, zpl: NO_TEXT_SCALE }

function restoreSession(): Partial<DesignerState> | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredSession
    return {
      template: parseTemplate(stored.template),
      language: stored.language === 'zpl' ? 'zpl' : 'tspl',
      dpi: [203, 300, 600].includes(stored.dpi) ? stored.dpi : 203,
      sample: stored.sample ?? {},
      textScale: { ...UNSCALED, ...stored.textScale },
      records: Array.isArray(stored.records) ? stored.records : [],
      path: stored.path ?? null,
      dirty: Boolean(stored.dirty),
    }
  } catch {
    return null
  }
}

export function persistSession(state: DesignerState): void {
  try {
    const stored: StoredSession = {
      template: serializeTemplate(state.template),
      language: state.language,
      dpi: state.dpi,
      sample: state.sample,
      textScale: state.textScale,
      records: state.records,
      path: state.path,
      dirty: state.dirty,
    }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored))
  } catch {
    // Storage can be missing or full; losing the session is not worth a crash.
  }
}

export function initialState(): DesignerState {
  return {
    template: starterTemplate(),
    selectedId: null,
    language: 'tspl',
    dpi: 203,
    zoom: ZOOM_DEFAULT,
    sample: { name: 'ACME Bearing 6204', sku: '7894561230' },
    textScale: UNSCALED,
    records: [],
    previewRow: null,
    past: [],
    future: [],
    dirty: false,
    path: null,
    ...restoreSession(),
  }
}

/** Record a document edit, pushing the previous version onto the undo stack. */
function edit(state: DesignerState, next: LabelTemplate): DesignerState {
  return {
    ...state,
    template: { ...next, updatedAt: new Date().toISOString() },
    past: [...state.past, state.template].slice(-MAX_UNDO),
    future: [],
    dirty: true,
  }
}

function mapElements(
  template: LabelTemplate,
  fn: (elements: LabelElement[]) => LabelElement[],
): LabelTemplate {
  return { ...template, elements: fn(template.elements) }
}

export function reducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'add': {
      const next = edit(
        state,
        mapElements(state.template, (elements) => [...elements, action.element]),
      )
      return { ...next, selectedId: action.element.id }
    }

    case 'update':
      return edit(
        state,
        mapElements(state.template, (elements) =>
          elements.map((element) =>
            element.id === action.id ? ({ ...element, ...action.patch } as LabelElement) : element,
          ),
        ),
      )

    case 'remove': {
      const next = edit(
        state,
        mapElements(state.template, (elements) =>
          elements.filter((element) => element.id !== action.id),
        ),
      )
      return {
        ...next,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      }
    }

    case 'arrange': {
      // The list reads top-down and later in the array draws on top, so the
      // move happens in the reversed order and is reversed back.
      const stacked = [...state.template.elements].reverse()
      const from = stacked.findIndex((element) => element.id === action.id)
      if (from < 0) return state
      const [moved] = stacked.splice(from, 1)
      if (!moved) return state
      stacked.splice(Math.min(stacked.length, Math.max(0, action.index)), 0, moved)
      return edit(state, { ...state.template, elements: stacked.reverse() })
    }

    case 'reorder': {
      const elements = [...state.template.elements]
      const index = elements.findIndex((element) => element.id === action.id)
      const target = action.direction === 'up' ? index + 1 : index - 1
      // Later in the array means drawn on top, which is what "up" means here.
      if (index < 0 || target < 0 || target >= elements.length) return state

      const moved = elements[index]
      const displaced = elements[target]
      if (!moved || !displaced) return state
      elements[index] = displaced
      elements[target] = moved

      return edit(state, { ...state.template, elements })
    }

    case 'select':
      return { ...state, selectedId: action.id }

    case 'media':
      return edit(state, {
        ...state.template,
        media: { ...state.template.media, ...action.patch },
      })

    case 'defaults':
      return edit(state, {
        ...state.template,
        defaults: { ...state.template.defaults, ...action.patch },
      })

    case 'rename':
      return edit(state, { ...state.template, name: action.name })

    case 'language':
      return { ...state, language: action.language }

    case 'dpi':
      return { ...state, dpi: action.dpi }

    case 'zoom':
      return { ...state, zoom: clampZoom(action.zoom) }

    case 'sample':
      return {
        ...state,
        sample: { ...state.sample, [action.field]: action.value },
      }

    case 'textScale':
      return {
        ...state,
        textScale: { ...state.textScale, [action.language]: action.scale },
      }

    case 'records':
      return {
        ...state,
        records: action.records,
        previewRow:
          state.previewRow !== null && state.previewRow < action.records.length
            ? state.previewRow
            : null,
      }

    case 'cell':
      return {
        ...state,
        records: state.records.map((record, index) =>
          index === action.row ? { ...record, [action.field]: action.value } : record,
        ),
      }

    case 'addRow': {
      const records = [...state.records, blankRecord(templateFields(state.template))]
      return { ...state, records, previewRow: records.length - 1 }
    }

    case 'removeRow': {
      const records = state.records.filter((_, index) => index !== action.row)
      const previewRow =
        state.previewRow === null
          ? null
          : state.previewRow === action.row
            ? null
            : state.previewRow > action.row
              ? state.previewRow - 1
              : state.previewRow
      return { ...state, records, previewRow }
    }

    case 'previewRow':
      return { ...state, previewRow: action.row }

    case 'load':
      return {
        ...state,
        template: action.template,
        path: action.path,
        selectedId: null,
        past: [],
        future: [],
        dirty: false,
      }

    case 'new':
      // A fresh document has nowhere to save to yet, and nothing to undo.
      return {
        ...state,
        template: action.template,
        path: null,
        selectedId: null,
        past: [],
        future: [],
        dirty: false,
      }

    case 'saved':
      return { ...state, path: action.path, dirty: false }

    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        template: previous,
        past: state.past.slice(0, -1),
        future: [state.template, ...state.future],
        dirty: true,
      }
    }

    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        template: next,
        past: [...state.past, state.template],
        future: state.future.slice(1),
        dirty: true,
      }
    }
  }
}

/** Factories for the "add element" rail, placed at a sensible default spot. */
export function newElement(kind: LabelElement['type'], at: { x: number; y: number }): LabelElement {
  switch (kind) {
    case 'text':
      return text({ ...at, value: 'Text', fontSize: 3 })
    case 'barcode':
      return barcode({
        ...at,
        value: '012345678905',
        symbology: 'code128',
        height: 10,
      })
    case 'qrcode':
      return qrcode({ ...at, value: 'https://example.com', moduleWidth: 0.5 })
    case 'box':
      return box({ ...at, width: 20, height: 10, thickness: 0.3 })
    case 'line':
      return line({ ...at, length: 20, thickness: 0.3 })
    case 'image':
      // Placed through the image picker rather than the rail; kept for completeness.
      return {
        id: elementId(),
        type: 'image',
        ...at,
        data: '',
        width: 10,
        height: 10,
      }
  }
}

export function useDesigner() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    persistSession(state)
  }, [
    state.template,
    state.language,
    state.dpi,
    state.sample,
    state.textScale,
    state.records,
    state.path,
    state.dirty,
  ])

  const selected = useMemo(
    () => state.template.elements.find((element) => element.id === state.selectedId) ?? null,
    [state.template.elements, state.selectedId],
  )

  const update = useCallback(
    (id: string, patch: Partial<LabelElement>) => dispatch({ type: 'update', id, patch }),
    [],
  )

  return { state, dispatch, selected, update }
}
