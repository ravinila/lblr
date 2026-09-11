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
      columns: 1,
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
  return candidate as LabelTemplate
}

export function serializeTemplate(template: LabelTemplate): string {
  const updated: LabelTemplate = {
    ...template,
    fields: templateFields(template),
    updatedAt: new Date().toISOString(),
  }
  return JSON.stringify(updated, null, 2)
}
