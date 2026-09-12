import { describe, expect, it } from 'vitest'
import {
  LABEL_PRESETS,
  createTemplate,
  layoutCells,
  layoutSize,
  matchPreset,
  parseTemplate,
  resolveLayout,
  stockLayout,
  textCalibrationSpec,
  textCalibrationTemplate,
  textScaleFromMeasurement,
  wrapText,
} from '@lblr/core'

const tag = () => createTemplate({ name: 't', width: 50, height: 25, gap: 2 })

describe('print layout', () => {
  it('defaults to a single label with no gaps', () => {
    const layout = resolveLayout(tag())
    expect(layout).toEqual({ columns: 1, rows: 1, columnGap: 2, rowGap: 2 })
    expect(layoutSize(tag().media, layout)).toEqual({ width: 50, height: 25 })
    expect(layoutCells(tag().media, layout)).toEqual([{ column: 0, row: 0, dx: 0, dy: 0 }])
  })

  it('takes the layout from the template defaults, and the option over that', () => {
    const template = tag()
    template.defaults.layout = { columns: 2, rows: 1 }
    expect(resolveLayout(template).columns).toBe(2)
    expect(resolveLayout(template, { layout: { columns: 3, rows: 3 } }).rows).toBe(3)
  })

  it('grows the media by the gap between cells', () => {
    const layout = resolveLayout(tag(), { layout: { columns: 3, rows: 3 } })
    expect(layoutSize(tag().media, layout)).toEqual({ width: 154, height: 79 })
  })

  it('walks cells left to right then top to bottom', () => {
    const layout = resolveLayout(tag(), {
      layout: { columns: 2, rows: 2, columnGap: 3 },
    })
    expect(layoutCells(tag().media, layout)).toEqual([
      { column: 0, row: 0, dx: 0, dy: 0 },
      { column: 1, row: 0, dx: 53, dy: 0 },
      { column: 0, row: 1, dx: 0, dy: 27 },
      { column: 1, row: 1, dx: 53, dy: 27 },
    ])
  })

  it('never produces fewer than one column or row', () => {
    expect(resolveLayout(tag(), { layout: { columns: 0, rows: -2 } })).toMatchObject({
      columns: 1,
      rows: 1,
    })
  })

  it('takes its columns from the stock when nothing else says', () => {
    const roll = createTemplate({ name: 'r', width: 25, height: 25, gap: 0, columns: 4 })
    expect(resolveLayout(roll)).toEqual({ columns: 4, rows: 1, columnGap: 0, rowGap: 0 })
    expect(layoutSize(roll.media, resolveLayout(roll))).toEqual({ width: 100, height: 25 })
    expect(stockLayout(roll.media)).toEqual(resolveLayout(roll))
  })

  it('lets the stock carry a column gap that differs from the row gap', () => {
    const roll = createTemplate({
      name: 'r',
      width: 30,
      height: 20,
      gap: 3,
      columns: 2,
      columnGap: 1,
    })
    expect(resolveLayout(roll)).toEqual({ columns: 2, rows: 1, columnGap: 1, rowGap: 3 })
    expect(layoutCells(roll.media, resolveLayout(roll))[1]).toEqual({
      column: 1,
      row: 0,
      dx: 31,
      dy: 0,
    })
  })

  it('lets a stored layout add rows without restating the stock columns', () => {
    const roll = createTemplate({ name: 'r', width: 25, height: 25, gap: 2, columns: 4 })
    roll.defaults.layout = { rows: 2 }
    expect(resolveLayout(roll)).toEqual({ columns: 4, rows: 2, columnGap: 2, rowGap: 2 })
  })

  it('moves columns saved on an old print layout onto the roll when parsing', () => {
    const old = createTemplate({ name: 'old', width: 25, height: 25, gap: 0 })
    old.defaults.layout = { columns: 4, rows: 2, columnGap: 0 }
    const parsed = parseTemplate(JSON.stringify(old))
    expect(parsed.media.columns).toBe(4)
    expect(parsed.media.columnGap).toBe(0)
    expect(parsed.defaults.layout).toEqual({ rows: 2 })
    expect(resolveLayout(parsed)).toEqual({ columns: 4, rows: 2, columnGap: 0, rowGap: 0 })
  })

  it('uses no gap on continuous stock', () => {
    const template = createTemplate({
      name: 'c',
      width: 50,
      height: 25,
      mediaType: 'continuous',
    })
    expect(resolveLayout(template, { layout: { columns: 2, rows: 1 } }).columnGap).toBe(0)
  })
})

describe('label presets', () => {
  it('are unique and physically sensible', () => {
    const ids = new Set(LABEL_PRESETS.map((preset) => preset.id))
    expect(ids.size).toBe(LABEL_PRESETS.length)
    for (const preset of LABEL_PRESETS) {
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(preset.gap).toBeGreaterThan(0)
    }
  })

  it('matches media by exact size', () => {
    expect(matchPreset({ width: 50, height: 25 })?.id).toBe('50x25')
    expect(matchPreset({ width: 51, height: 25 })).toBeUndefined()
  })
})

describe('text wrapping', () => {
  it('folds words onto the next line and cuts words longer than a line', () => {
    // 3 mm cap height is 1.8 mm per character; 9 mm holds 5.
    expect(wrapText('ab cd ef', 3, 9)).toEqual(['ab cd', 'ef'])
    expect(wrapText('QuickMart', 3, 9)).toEqual(['Quick', 'Mart'])
    expect(wrapText('a\nb', 3, 9)).toEqual(['a', 'b'])
    expect(wrapText('no wrapping at all', 3)).toEqual(['no wrapping at all'])
    expect(wrapText('', 3, 9)).toEqual([''])
  })

  it('derives the text correction from a ruler measurement', () => {
    const spec = textCalibrationSpec({ width: 25, height: 25 })
    expect(spec.capHeight).toBe(3.5)
    expect(spec.expectedWidth).toBe(21)
    // The printer drew the digits twice as tall and twice as wide.
    const scale = textScaleFromMeasurement(spec, 7, 42)
    expect(scale).toEqual({ height: 0.5, width: 0.5 })
  })

  it('prints the size check once across the whole pass, not once per column', () => {
    const roll = createTemplate({ name: 'r', width: 25, height: 25, gap: 2, columns: 4 })
    const check = textCalibrationTemplate(roll.media)
    expect(check.media.width).toBe(106)
    expect(check.media.columns).toBe(1)
    expect(resolveLayout(check).columns).toBe(1)
  })
})
