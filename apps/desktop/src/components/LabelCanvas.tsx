/**
 * The label, at true device resolution.
 *
 * At zoom 1 one printer dot is one screen pixel — that is the whole claim the
 * app makes, so it is the thing the canvas is built around rather than an
 * afterthought. Zooming multiplies that ratio; it never resamples through some
 * unrelated CSS scale.
 *
 * Past 4× a dot becomes large enough to see, and the dot grid fades in. It is
 * the one deliberate flourish in the interface, and it earns its place: it is
 * the moment the abstraction drops and you are looking at the actual raster the
 * printhead will burn, which is exactly when a half-dot misalignment matters.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import {
  bindElement,
  dotsPerMm,
  snapMm,
  type DataRecord,
  type LabelTemplate,
} from '@lblr/core'

import { ElementShape } from './ElementShape.js'

const RULER = 22
const MAT = '#18201e'
const RULER_BG = '#212a28'
const HAIRLINE = '#33403d'
const INSTRUMENT = '#4cc3f0'

export interface LabelCanvasProps {
  template: LabelTemplate
  data: DataRecord
  dpi: number
  zoom: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onPointer: (position: { x: number; y: number } | null) => void
}

/** Ruler ticks chosen so labels never collide at the current scale. */
function tickStep(pxPerMm: number): number {
  for (const step of [1, 2, 5, 10, 20, 50]) {
    if (step * pxPerMm >= 44) return step
  }
  return 100
}

export function LabelCanvas({
  template,
  data,
  dpi,
  zoom,
  selectedId,
  onSelect,
  onMove,
  onPointer,
}: LabelCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const pxPerMm = dotsPerMm(dpi) * zoom
  const labelWidth = template.media.width * pxPerMm
  const labelHeight = template.media.height * pxPerMm

  // Centre the label in whatever space is left beside the rulers.
  const originX = Math.max(RULER, RULER + (size.width - RULER - labelWidth) / 2)
  const originY = Math.max(RULER, RULER + (size.height - RULER - labelHeight) / 2)

  const step = tickStep(pxPerMm)
  const showDots = zoom >= 4
  const [dotsVisible, setDotsVisible] = useState(showDots)

  // Fade rather than snap, so crossing the threshold reads as a change of
  // magnification and not a rendering glitch.
  useEffect(() => {
    const timer = window.setTimeout(() => setDotsVisible(showDots), showDots ? 0 : 120)
    return () => window.clearTimeout(timer)
  }, [showDots])

  const ticks: number[] = []
  for (let mm = 0; mm <= Math.max(template.media.width, template.media.height); mm += step) {
    ticks.push(mm)
  }

  const dotPitch = pxPerMm / dotsPerMm(dpi) // one dot, in screen pixels
  const dotLines: number[][] = []
  if (dotsVisible) {
    for (let x = dotPitch; x < labelWidth; x += dotPitch) dotLines.push([x, 0, x, labelHeight])
    for (let y = dotPitch; y < labelHeight; y += dotPitch) dotLines.push([0, y, labelWidth, y])
  }

  return (
    <div ref={host} className="stage-host" style={{ position: 'absolute', inset: 0 }}>
      <Stage
        width={size.width}
        height={size.height}
        onMouseDown={(event) => {
          // A click on bare mat clears the selection; clicks on a shape are
          // stopped by the shape itself.
          if (event.target === event.target.getStage()) onSelect(null)
        }}
        onMouseMove={(event) => {
          const point = event.target.getStage()?.getPointerPosition()
          if (!point) return onPointer(null)
          onPointer({ x: (point.x - originX) / pxPerMm, y: (point.y - originY) / pxPerMm })
        }}
        onMouseLeave={() => onPointer(null)}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={size.width} height={size.height} fill={MAT} />
        </Layer>

        {/* The label itself: the only bright object on the bench. */}
        <Layer x={originX} y={originY}>
          <Rect
            x={0}
            y={0}
            width={labelWidth}
            height={labelHeight}
            fill="#ffffff"
            shadowColor="#000000"
            shadowBlur={18}
            shadowOpacity={0.45}
            shadowOffsetY={4}
            listening={false}
          />

          {dotsVisible ? (
            <Group opacity={0.5} listening={false}>
              {dotLines.map((points, index) => (
                <Line key={index} points={points} stroke="#dbe4e1" strokeWidth={1} />
              ))}
            </Group>
          ) : null}

          {template.elements.map((element) => (
            <ElementShape
              key={element.id}
              element={bindElement(element, data)}
              pxPerMm={pxPerMm}
              dpi={dpi}
              selected={element.id === selectedId}
              onSelect={() => onSelect(element.id)}
              onMove={(x, y) => onMove(element.id, snapMm(x, dpi), snapMm(y, dpi))}
            />
          ))}

          {/* Drawn last so the media edge stays visible over dark artwork. */}
          <Rect
            x={0}
            y={0}
            width={labelWidth}
            height={labelHeight}
            stroke={HAIRLINE}
            strokeWidth={1}
            listening={false}
          />
        </Layer>

        <Layer listening={false}>
          <Rect x={0} y={0} width={size.width} height={RULER} fill={RULER_BG} />
          <Rect x={0} y={0} width={RULER} height={size.height} fill={RULER_BG} />
          <Line points={[0, RULER + 0.5, size.width, RULER + 0.5]} stroke={HAIRLINE} strokeWidth={1} />
          <Line points={[RULER + 0.5, 0, RULER + 0.5, size.height]} stroke={HAIRLINE} strokeWidth={1} />

          {ticks.map((mm) => {
            const x = originX + mm * pxPerMm
            if (mm > template.media.width || x > size.width) return null
            return (
              <Group key={`x${mm}`}>
                <Line points={[x, RULER - 5, x, RULER]} stroke="#7d908c" strokeWidth={1} />
                <Text
                  x={x + 3}
                  y={5}
                  text={String(mm)}
                  fontSize={10}
                  fontFamily="Cascadia Mono, Consolas, monospace"
                  fill="#92a5a0"
                />
              </Group>
            )
          })}

          {ticks.map((mm) => {
            const y = originY + mm * pxPerMm
            if (mm > template.media.height || y > size.height) return null
            return (
              <Group key={`y${mm}`}>
                <Line points={[RULER - 5, y, RULER, y]} stroke="#7d908c" strokeWidth={1} />
                <Text
                  x={3}
                  y={y + 3}
                  text={String(mm)}
                  fontSize={10}
                  fontFamily="Cascadia Mono, Consolas, monospace"
                  fill="#92a5a0"
                />
              </Group>
            )
          })}

          {/* The corner where the rulers meet covers the first tick of each,
              so it names the unit instead. */}
          <Rect x={0} y={0} width={RULER} height={RULER} fill={RULER_BG} />
          <Text
            x={4}
            y={7}
            text="mm"
            fontSize={9}
            fontFamily="Cascadia Mono, Consolas, monospace"
            fill={INSTRUMENT}
          />
        </Layer>
      </Stage>
    </div>
  )
}
