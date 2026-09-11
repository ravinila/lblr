/**
 * Data binding.
 *
 * Any string field on an element may contain `{{field}}` placeholders that are
 * resolved against a data record just before compilation. Substitution happens
 * on the model, not on the emitted commands, so an unresolved placeholder is
 * caught by the validator rather than printed onto a label.
 */

import type { DataRecord, LabelElement, LabelTemplate } from './types.js'

/** Matches `{{ field }}`, tolerating surrounding whitespace. */
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g

/** Every field name referenced anywhere in a string, in order of appearance. */
export function fieldsIn(value: string): string[] {
  const found: string[] = []
  for (const match of value.matchAll(PLACEHOLDER)) {
    const name = match[1]
    if (name && !found.includes(name)) found.push(name)
  }
  return found
}

/** Every field name referenced by any element in the template. */
export function templateFields(template: LabelTemplate): string[] {
  const found: string[] = []
  for (const element of template.elements) {
    for (const value of bindableStrings(element)) {
      for (const name of fieldsIn(value)) {
        if (!found.includes(name)) found.push(name)
      }
    }
  }
  return found
}

/**
 * Replace placeholders with values from `data`.
 *
 * A field missing from the record resolves to an empty string rather than
 * leaving the raw `{{...}}` in place: a blank space on a label is recoverable,
 * literal braces burnt into a barcode are not.
 */
export function resolve(value: string, data: DataRecord = {}): string {
  return value.replace(PLACEHOLDER, (_, name: string) => {
    const raw = data[name]
    return raw === undefined || raw === null ? '' : String(raw)
  })
}

/** The string fields of an element that participate in data binding. */
function bindableStrings(element: LabelElement): string[] {
  switch (element.type) {
    case 'text':
    case 'barcode':
    case 'qrcode':
      return [element.value]
    default:
      return []
  }
}

/**
 * Return a copy of the element with every placeholder resolved. Elements
 * without bindable content are returned unchanged rather than cloned.
 */
export function bindElement(element: LabelElement, data: DataRecord = {}): LabelElement {
  switch (element.type) {
    case 'text':
    case 'barcode':
    case 'qrcode':
      return { ...element, value: resolve(element.value, data) }
    default:
      return element
  }
}

/** Return a copy of the template with every element's placeholders resolved. */
export function bindTemplate(template: LabelTemplate, data: DataRecord = {}): LabelTemplate {
  return {
    ...template,
    elements: template.elements.map((element) => bindElement(element, data)),
  }
}
