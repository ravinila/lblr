/**
 * What one pass of the printer will cover.
 *
 * Every cell is the template stamped at the same offsets the compilers use
 * (`layoutCells`), so if the preview shows column two overlapping column one,
 * the printout will too. It is a picture of the strip, not the bench: it fits
 * the whole pass into the space it is given rather than keeping dots honest,
 * and it is not interactive.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { Group, Layer, Rect, Stage } from 'react-konva'
import {
  bindElement,
  layoutCells,
  layoutSize,
  type DataRecord,
  type LabelTemplate,
  type ResolvedLayout,
} from '@lblr/core'

import { ElementShape } from './ElementShape.js'

const BENCH = '#dfe3e8'
const LINER = '#efe8d8'
const LINER_EDGE = '#d9d0ba'
const CUT = '#c9cfd6'

export interface PrintPreviewProps {
  template: LabelTemplate
  data: DataRecord
  dpi: number
  layout: ResolvedLayout
  /** Tallest the preview grows before the pass is scaled down to fit. */
  maxHeight?: number
}

export function PrintPreview({ template, data, dpi, layout, maxHeight = 360 }: PrintPreviewProps) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { media } = template
  const pass = layoutSize(media, layout)
  const cells = layoutCells(media, layout)
  const pad = 20
  const webMargin = 1.5
  const rowMargin = media.type === 'continuous' ? 0 : layout.rowGap / 2

  const linerWidth = pass.width + webMargin * 2
  const linerHeight = pass.height + rowMargin * 2
  const innerWidth = Math.max(0, width - pad * 2)
  const pxPerMm = Math.max(
    0,
    Math.min(innerWidth / linerWidth, (maxHeight - pad * 2) / linerHeight),
  )
  const height = Math.round(linerHeight * pxPerMm + pad * 2)
  const originX = pad + (innerWidth - linerWidth * pxPerMm) / 2 + webMargin * pxPerMm
  const originY = pad + rowMargin * pxPerMm
  const bound = template.elements.map((element) => bindElement(element, data))

  return (
    <div ref={host} className="preview" aria-label="Print preview">
      {width > 0 ? (
        <Stage width={width} height={height} listening={false}>
          <Layer listening={false}>
            <Rect x={0} y={0} width={width} height={height} fill={BENCH} />

            <Rect
              x={originX - webMargin * pxPerMm}
              y={originY - rowMargin * pxPerMm}
              width={linerWidth * pxPerMm}
              height={linerHeight * pxPerMm}
              fill={LINER}
              stroke={LINER_EDGE}
              strokeWidth={1}
              shadowColor="#000000"
              shadowBlur={14}
              shadowOpacity={0.2}
              shadowOffsetY={4}
            />

            {cells.map((cell) => (
              <Group
                key={`${cell.column},${cell.row}`}
                x={originX + cell.dx * pxPerMm}
                y={originY + cell.dy * pxPerMm}
              >
                <Rect
                  x={0}
                  y={0}
                  width={media.width * pxPerMm}
                  height={media.height * pxPerMm}
                  fill="#ffffff"
                />
                {template.elements.map((element, index) => (
                  <ElementShape
                    key={element.id}
                    element={bound[index] ?? element}
                    pxPerMm={pxPerMm}
                    dpi={dpi}
                    selected={false}
                    onSelect={() => {}}
                    onMove={() => {}}
                  />
                ))}
                <Rect
                  x={0}
                  y={0}
                  width={media.width * pxPerMm}
                  height={media.height * pxPerMm}
                  stroke={CUT}
                  strokeWidth={1}
                />
              </Group>
            ))}
          </Layer>
        </Stage>
      ) : null}
    </div>
  )
}
