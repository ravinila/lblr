/**
 * Designer state.
 *
 * A reducer rather than a store library: the whole editable world is one
 * `LabelTemplate` plus a selection, and undo is then just a stack of previous
 * templates. Keeping the document in the shape the compilers already accept
 * means saving, printing and previewing never need a translation step.
 */

import { useCallback, useMemo, useReducer } from 'react'
import {
  barcode,
  box,
  createTemplate,
  elementId,
  line,
  qrcode,
  text,
  type LabelElement,
  type LabelTemplate,
  type MediaSpec,
  type PrintDefaults,
} from '@lblr/core'

export type PrinterLanguage = 'tspl' | 'zpl'

export interface DesignerState {
  template: LabelTemplate
  selectedId: string | null
  language: PrinterLanguage
  dpi: number
  zoom: number
  /** Sample values for `{{field}}` placeholders, so the canvas shows real text. */
  sample: Record<string, string>
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
  | { type: 'select'; id: string | null }
  | { type: 'media'; patch: Partial<MediaSpec> }
  | { type: 'defaults'; patch: Partial<PrintDefaults> }
  | { type: 'rename'; name: string }
  | { type: 'language'; language: PrinterLanguage }
  | { type: 'dpi'; dpi: number }
  | { type: 'zoom'; zoom: number }
  | { type: 'sample'; field: string; value: string }
  | { type: 'load'; template: LabelTemplate; path: string | null }
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

export function initialState(): DesignerState {
  return {
    template: starterTemplate(),
    selectedId: null,
    language: 'tspl',
    dpi: 203,
    zoom: 4,
    sample: { name: 'ACME Bearing 6204', sku: '7894561230' },
    past: [],
    future: [],
    dirty: false,
    path: null,
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
            element.id === action.id
              ? ({ ...element, ...action.patch } as LabelElement)
              : element,
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
      return { ...next, selectedId: state.selectedId === action.id ? null : state.selectedId }
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
      return edit(state, { ...state.template, media: { ...state.template.media, ...action.patch } })

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
      return { ...state, zoom: Math.min(16, Math.max(1, action.zoom)) }

    case 'sample':
      return { ...state, sample: { ...state.sample, [action.field]: action.value } }

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
      return barcode({ ...at, value: '012345678905', symbology: 'code128', height: 10 })
    case 'qrcode':
      return qrcode({ ...at, value: 'https://example.com', moduleWidth: 0.5 })
    case 'box':
      return box({ ...at, width: 20, height: 10, thickness: 0.3 })
    case 'line':
      return line({ ...at, length: 20, thickness: 0.3 })
    case 'image':
      // Placed through the image picker rather than the rail; kept for completeness.
      return { id: elementId(), type: 'image', ...at, data: '', width: 10, height: 10 }
  }
}

export function useDesigner() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

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
