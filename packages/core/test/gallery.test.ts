import { describe, expect, it } from 'vitest'
import { LABEL_DESIGNS, createTemplate, designsFor, validateTemplate } from '@lblr/core'

const SIZES = [
  { width: 25, height: 25 },
  { width: 40, height: 20 },
  { width: 50, height: 25 },
  { width: 75, height: 50 },
  { width: 100, height: 150 },
]

describe('starter designs', () => {
  it('lay out without errors on every size they claim to fit', () => {
    for (const design of LABEL_DESIGNS) {
      for (const size of SIZES) {
        if (size.width < design.minWidth || size.height < design.minHeight) continue
        const template = createTemplate({
          name: design.name,
          width: size.width,
          height: size.height,
          elements: design.build(size),
        })
        const errors = validateTemplate(template, { dpi: 203, data: design.sample }).filter(
          (issue) => issue.severity === 'error',
        )
        expect(
          errors,
          `${design.id} on ${size.width}×${size.height}: ${errors.map((e) => e.message).join('; ')}`,
        ).toEqual([])
      }
    }
  })

  it('offers only what fits, blank always included', () => {
    const small = designsFor({ width: 25, height: 25 }).map((design) => design.id)
    expect(small).toContain('blank')
    expect(small).toContain('qr-tag')
    expect(small).not.toContain('product')
    expect(small).not.toContain('shipping')

    const big = designsFor({ width: 100, height: 150 }).map((design) => design.id)
    expect(big).toEqual(LABEL_DESIGNS.map((design) => design.id))
  })

  it('keeps barcode modules on whole dots that scanners can read', () => {
    const product = LABEL_DESIGNS.find((design) => design.id === 'product')
    const elements = product?.build({ width: 50, height: 25 }) ?? []
    const bars = elements.find((element) => element.type === 'barcode')
    expect(bars?.type).toBe('barcode')
    if (bars?.type === 'barcode') {
      const dots = (bars.moduleWidth ?? 0) / (25.4 / 203)
      expect(Math.abs(dots - Math.round(dots))).toBeLessThan(1e-9)
      expect(dots).toBeGreaterThanOrEqual(2)
    }
  })
})
