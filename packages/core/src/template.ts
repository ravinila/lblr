import { elementId } from './elements.js'
import { templateFields } from './binding.js'
import type { LabelElement, LabelTemplate, MediaSpec, PrintDefaults } from './types.js'

/** Suits thermal transfer ribbon on a 203 dpi desktop printer. */
export const DEFAULT_PRINT_DEFAULTS: PrintDefaults = {
  darkness: 8,
  speed: 4,
  direction: 1,
  copies: 1,
}

export interface CreateTemplateInput {
  name: string
  /** Label width in millimetres. */
  width: number
  /** Label height in millimetres. */
  height: number
  /** Gap between labels. Defaults to 2 mm, the most common die-cut stock. */
  gap?: number
  /** Labels across the roll. Defaults to 1. */
  columns?: number
  /** Space between columns. Defaults to `gap`. */
  columnGap?: number
  mediaType?: MediaSpec['type']
  elements?: LabelElement[]
  defaults?: Partial<PrintDefaults>
  id?: string
}

export function createTemplate(input: CreateTemplateInput): LabelTemplate {
  const now = new Date().toISOString()
  const template: LabelTemplate = {
    version: 1,
    id: input.id ?? elementId(),
    name: input.name,
    media: {
      width: input.width,
      height: input.height,
      gap: input.gap ?? 2,
      type: input.mediaType ?? 'gap',
      columns: Math.max(1, Math.floor(input.columns ?? 1)),
      ...(input.columnGap === undefined ? {} : { columnGap: input.columnGap }),
    },
    defaults: { ...DEFAULT_PRINT_DEFAULTS, ...input.defaults },
    elements: input.elements ?? [],
    createdAt: now,
    updatedAt: now,
  }
  template.fields = templateFields(template)
  return template
}

/** Parse a saved template, rejecting anything this build cannot represent. */
export function parseTemplate(json: string): LabelTemplate {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Template is not an object')
  }
  const candidate = parsed as Partial<LabelTemplate>
  if (candidate.version !== 1) {
    throw new Error(`Unsupported template version: ${String(candidate.version)}`)
  }
  if (!candidate.media || !Array.isArray(candidate.elements)) {
    throw new Error('Template is missing media or elements')
  }
  return migrate(candidate as LabelTemplate)
}

/**
 * Files written before the roll carried its own column count kept "labels
 * across" on the print layout. The roll is the truth now, so anything found
 * there moves onto the media and the layout keeps only its rows.
 */
function migrate(template: LabelTemplate): LabelTemplate {
  const layout = template.defaults?.layout
  if (!layout || (layout.columns === undefined && layout.columnGap === undefined)) return template

  const { columns, columnGap, ...rest } = layout
  const media = { ...template.media }
  if (columns !== undefined && (media.columns ?? 1) <= 1) media.columns = Math.max(1, columns)
  if (columnGap !== undefined && media.columnGap === undefined) media.columnGap = columnGap

  const defaults = { ...template.defaults }
  if (rest.rows !== undefined || rest.rowGap !== undefined) defaults.layout = rest
  else delete defaults.layout

  return { ...template, media, defaults }
}

export function serializeTemplate(template: LabelTemplate): string {
  const updated: LabelTemplate = {
    ...template,
    fields: templateFields(template),
    updatedAt: new Date().toISOString(),
  }
  return JSON.stringify(updated, null, 2)
}
