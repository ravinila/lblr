/**
 * The roll, at true device resolution.
 *
 * At zoom 1 one printer dot is one screen pixel — that is the whole claim the
 * app makes, so it is the thing the canvas is built around rather than an
 * afterthought. Zooming multiplies that ratio; it never resamples through some
 * unrelated CSS scale.
 *
 * What is drawn is the stock, not an abstract label: a strip of liner with as
 * many labels across as the roll carries, and the start of the next row below,
 * so the gap between rows is something you can see rather than a number. The
 * first cell is the one being edited. The others are live copies of it,
 * because that is what the printer will produce, and seeing a 25 × 25 label
 * as one of four squares on a strip is the difference between designing on
 * paper and designing in the void.
 *
 * Past 4× a dot becomes large enough to see, and the dot grid fades in. It is
 * the moment the abstraction drops and you are looking at the actual raster
 * the printhead will burn, which is exactly when a half-dot misalignment
 * matters.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import {
  bindElement,
  dotsPerMm,
  elementBounds,
  snapToGuides,
  type Guide,
  layoutCells,
  layoutSize,
  resolveLayout,
  linePitch,
  snapMm,
  type DataRecord,
  type LabelElement,
  type LabelTemplate,
} from '@lblr/core'

import { CAP_RATIO, ElementShape, TEXT_FONT_FAMILY, resizeHandles } from './ElementShape.js'
import { InlineEditor } from './InlineEditor.js'

export const RULER = 24
const BENCH = '#dfe3e8'
const RULER_BG = '#f6f7f9'
const RULER_LINE = '#cdd3db'
const TICK = '#9aa3ae'
const TICK_TEXT = '#5f6975'
const LINER = '#efe8d8'
const LINER_EDGE = '#d9d0ba'
const PAPER = '#ffffff'
const CUT = '#c9cfd6'
const INSTRUMENT = '#2563eb'
const GUIDE = '#ff2d7a'
const MONO = 'Cascadia Mono, Consolas, monospace'

/** Liner showing beyond the labels on either side, in millimetres. */
const WEB_MARGIN = 1.5

/**
 * The area the canvas draws for a template, in millimetres: one print pass
 * plus the row that follows it. Fit-to-window sizes against this.
 */
export type CanvasView = 'label' | 'roll'

export function drawnSize(
  template: LabelTemplate,
  view: CanvasView = 'roll',
): { width: number; height: number } {
  if (view === 'label') return { width: template.media.width, height: template.media.height }
  const layout = resolveLayout(template)
  const pass = layoutSize(template.media, layout)
  return { width: pass.width, height: pass.height + layout.rowGap + template.media.height }
}

export interface LabelCanvasProps {
  template: LabelTemplate
  data: DataRecord
  /**
   * What the other cells hold when printing from the data sheet: the records
   * that follow `data` in print order, one per cell in reading order across
   * the pass and then the next row, or null for a cell left blank. Omitted
   * means every cell is a copy of the edited one.
   */
  sequence?: Array<DataRecord | null>
  /** The whole strip with its neighbours, or just the label being edited. */
  view: CanvasView
  dpi: number
  zoom: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  /** A resize handle was released on an element. */
  onResize: (id: string, patch: Partial<LabelElement>) => void
  /** A value was edited in place. */
  onEdit: (id: string, value: string) => void
  onPointer: (position: { x: number; y: number } | null) => void
  /** Ctrl+wheel. `factor` multiplies the current zoom. */
  onZoomBy: (factor: number) => void
  /** The stage's pixel size, so the app can compute a zoom that fits. */
  onViewport?: (size: { width: number; height: number }) => void
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
  sequence,
  view,
  dpi,
  zoom,
  selectedId,
  onSelect,
  onMove,
  onResize,
  onEdit,
  onPointer,
  onZoomBy,
  onViewport,
}: LabelCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // In-place editing: the id of the element whose value is open in an
  // editor laid over the stage. Only elements with a value qualify.
  const [editingId, setEditingId] = useState<string | null>(null)

  // Smart guides: computed on every drag step, drawn once per frame.
  const [guides, setGuides] = useState<Guide[]>([])
  const pendingGuides = useRef<Guide[]>([])
  const guideFrame = useRef(0)
  const showGuides = (next: Guide[]) => {
    pendingGuides.current = next
    if (!guideFrame.current) {
      guideFrame.current = requestAnimationFrame(() => {
        guideFrame.current = 0
        setGuides(pendingGuides.current)
      })
    }
  }
  const snapDrag = (id: string, x: number, y: number): { x: number; y: number } => {
    const element = template.elements.find((item) => item.id === id)
    if (!element) return { x, y }
    const moving = elementBounds({ ...element, x, y })
    const others = template.elements
      .filter((item) => item.id !== id && !item.hidden)
      .map((item) => elementBounds(item))
    // Six screen pixels of reach, whatever the zoom.
    const result = snapToGuides(
      moving,
      others,
      { width: template.media.width, height: template.media.height },
      6 / (dotsPerMm(dpi) * zoom),
    )
    showGuides(result.guides)
    return { x: x + (result.x - moving.x), y: y + (result.y - moving.y) }
  }
  const editing = template.elements.find((element) => element.id === editingId)
  useEffect(() => {
    if (editingId && !editing) setEditingId(null)
  }, [editingId, editing])

  // The transformer needs the Konva node of whatever is selected. Nodes
  // register themselves by element id as they mount.
  const nodes = useRef(new Map<string, Konva.Group>())
  const transformer = useRef<Konva.Transformer>(null)
  const selectedElement = template.elements.find((element) => element.id === selectedId)
  const handles = selectedElement ? resizeHandles(selectedElement) : null

  // Alt while resizing scales about the element's centre, as in every
  // image editor. Shift is Konva's own: it flips the keep-ratio rule.
  const [fromCentre, setFromCentre] = useState(false)
  useEffect(() => {
    const track = (event: KeyboardEvent) => setFromCentre(event.altKey)
    const clear = () => setFromCentre(false)
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
      window.removeEventListener('blur', clear)
    }
  }, [])
  useEffect(() => {
    const tr = transformer.current
    if (!tr) return
    const node = selectedId ? nodes.current.get(selectedId) : undefined
    const usable = node && selectedElement && !selectedElement.locked && !selectedElement.hidden
    tr.nodes(usable ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, selectedElement, template.elements, zoom, dpi])

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
      setSize(next)
      onViewport?.(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onViewport])

  // Ctrl+wheel zooms the label, and must be stopped here before the WebView
  // reads it as a request to zoom the whole interface. Konva registers its
  // wheel listener non-passive, so preventDefault is honoured.
  const zoomByRef = useRef(onZoomBy)
  zoomByRef.current = onZoomBy
  useEffect(() => {
    const element = host.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      // Trackpads report small deltas continuously; mouse wheels report ~100
      // per notch. Scaling by the delta keeps both feeling proportional.
      const factor = Math.exp(-event.deltaY * 0.0025)
      zoomByRef.current(factor)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const { media } = template
  const layout = resolveLayout(template)
  const single = view === 'label'
  // In the single-label view only the edited cell is drawn, as its own pass.
  const cells = single ? layoutCells(media, layout).slice(0, 1) : layoutCells(media, layout)
  const pass = single ? { width: media.width, height: media.height } : layoutSize(media, layout)
  const drawn = drawnSize(template, view)
  // Where the row after this pass begins: the gap is what shows between.
  const nextRowY = pass.height + layout.rowGap

  const pxPerMm = dotsPerMm(dpi) * zoom
  const labelWidth = media.width * pxPerMm
  const labelHeight = media.height * pxPerMm
  const passWidth = pass.width * pxPerMm
  const drawnHeight = drawn.height * pxPerMm

  // Centre the whole strip in whatever space is left beside the rulers. The
  // origin is the top-left of the first label, which is what the rulers and
  // the pointer readout measure from.
  const originX = Math.max(RULER + 24, RULER + (size.width - RULER - passWidth) / 2)
  const originY = Math.max(RULER + 24, RULER + (size.height - RULER - drawnHeight) / 2)

  const step = tickStep(pxPerMm)
  const showDots = zoom >= 4
  const [dotsVisible, setDotsVisible] = useState(showDots)

  // Fade rather than snap, so crossing the threshold reads as a change of
  // magnification and not a rendering glitch.
  useEffect(() => {
    const timer = window.setTimeout(() => setDotsVisible(showDots), showDots ? 0 : 120)
    return () => window.clearTimeout(timer)
  }, [showDots])

  const xTicks: number[] = []
  for (let mm = 0; mm <= pass.width + 1e-6; mm += step) xTicks.push(mm)
  const yTicks: number[] = []
  for (let mm = 0; mm <= drawn.height + 1e-6; mm += step) yTicks.push(mm)

  const dotPitch = pxPerMm / dotsPerMm(dpi) // one dot, in screen pixels
  const dotLines: number[][] = []
  if (dotsVisible) {
    for (let x = dotPitch; x < labelWidth; x += dotPitch) dotLines.push([x, 0, x, labelHeight])
    for (let y = dotPitch; y < labelHeight; y += dotPitch) dotLines.push([0, y, labelWidth, y])
  }

  const webMargin = WEB_MARGIN * pxPerMm
  const rowMargin = (media.type === 'continuous' ? 0 : layout.rowGap / 2) * pxPerMm
  const bindAll = (record: DataRecord) =>
    template.elements.map((element) => bindElement(element, record))
  const bound = bindAll(data)
  /** The bound elements for a non-edited cell, or none when the pass leaves it blank. */
  const boundFor = (slot: number) => {
    if (!sequence) return bound
    const record = sequence[slot]
    return record ? bindAll(record) : []
  }
  const columns = layout.columns

  return (
    <div ref={host} className="stage-host" style={{ position: 'absolute', inset: 0 }}>
      {/* Konva draws stroked, shadowed shapes through a buffer canvas the size
          of the stage, and a 0 × 0 buffer throws. So nothing is drawn until
          the resize observer has reported a real size. */}
      {size.width > 0 && size.height > 0 ? (
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={(event) => {
            // A click on bare bench clears the selection; clicks on a shape are
            // stopped by the shape itself.
            if (event.target === event.target.getStage()) onSelect(null)
          }}
          onMouseMove={(event) => {
            const point = event.target.getStage()?.getPointerPosition()
            if (!point) return onPointer(null)
            onPointer({
              x: (point.x - originX) / pxPerMm,
              y: (point.y - originY) / pxPerMm,
            })
          }}
          onMouseLeave={() => onPointer(null)}
        >
          <Layer listening={false}>
            <Rect x={0} y={0} width={size.width} height={size.height} fill={BENCH} />
          </Layer>

          <Layer x={originX} y={originY}>
            {/* The liner: the strip of backing the labels sit on. */}
            <Rect
              x={-webMargin}
              y={-rowMargin}
              width={passWidth + webMargin * 2}
              height={drawnHeight + rowMargin * 2}
              fill={LINER}
              stroke={LINER_EDGE}
              strokeWidth={1}
              shadowColor="#000000"
              shadowBlur={22}
              shadowOpacity={0.22}
              shadowOffsetY={6}
              listening={false}
            />

            {cells.map((cell) => {
              const active = cell.column === 0 && cell.row === 0
              return (
                <Group
                  key={`${cell.column},${cell.row}`}
                  x={cell.dx * pxPerMm}
                  y={cell.dy * pxPerMm}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={labelWidth}
                    height={labelHeight}
                    fill={PAPER}
                    listening={false}
                  />

                  {active && dotsVisible ? (
                    <Group opacity={0.5} listening={false}>
                      {dotLines.map((points, index) => (
                        <Line key={index} points={points} stroke="#dbe4e1" strokeWidth={1} />
                      ))}
                    </Group>
                  ) : null}

                  {active ? (
                    <>
                      {template.elements.map((element, index) => (
                        <ElementShape
                          key={element.id}
                          ref={(node) => {
                            if (node) nodes.current.set(element.id, node)
                            else nodes.current.delete(element.id)
                          }}
                          element={bound[index] ?? element}
                          pxPerMm={pxPerMm}
                          dpi={dpi}
                          selected={element.id === selectedId}
                          label={{ width: media.width, height: media.height }}
                          onSelect={() => onSelect(element.id)}
                          onMove={(x, y) => {
                            showGuides([])
                            onMove(element.id, snapMm(x, dpi), snapMm(y, dpi))
                          }}
                          onDragSnap={(x, y) => snapDrag(element.id, x, y)}
                          onResize={(patch) => onResize(element.id, patch)}
                          editing={editingId === element.id}
                          onEdit={() => {
                            if ('value' in element && !element.locked) setEditingId(element.id)
                          }}
                        />
                      ))}
                      {/* Handles on the selected element. Rotation stays a
                          quarter-turn choice in the inspector, so the rotate
                          handle is off. */}
                      <Transformer
                        ref={transformer}
                        rotateEnabled={false}
                        centeredScaling={fromCentre}
                        keepRatio={handles?.keepRatio ?? false}
                        enabledAnchors={handles?.anchors ?? []}
                        anchorSize={8}
                        anchorCornerRadius={2}
                        anchorStroke={INSTRUMENT}
                        anchorFill="#ffffff"
                        borderStroke={INSTRUMENT}
                        ignoreStroke
                        boundBoxFunc={(previous, next) =>
                          next.width < 4 || next.height < 4 ? previous : next
                        }
                      />
                      {/* Smart guides: what the dragged element is lined up with. */}
                      {guides.map((guide, index) => (
                        <Line
                          key={index}
                          points={
                            guide.axis === 'x'
                              ? [
                                  guide.at * pxPerMm,
                                  guide.from * pxPerMm,
                                  guide.at * pxPerMm,
                                  guide.to * pxPerMm,
                                ]
                              : [
                                  guide.from * pxPerMm,
                                  guide.at * pxPerMm,
                                  guide.to * pxPerMm,
                                  guide.at * pxPerMm,
                                ]
                          }
                          stroke={GUIDE}
                          strokeWidth={1}
                          listening={false}
                        />
                      ))}
                    </>
                  ) : (
                    // Sibling cells: live copies of the edited label, or, when
                    // printing from the sheet, the records that follow it.
                    // Slightly lifted so the eye finds the one that takes edits.
                    <Group opacity={0.55} listening={false}>
                      {boundFor(cell.row * columns + cell.column - 1).map((element) => (
                        <ElementShape
                          key={element.id}
                          element={element}
                          pxPerMm={pxPerMm}
                          dpi={dpi}
                          selected={false}
                          onSelect={() => {}}
                          onMove={() => {}}
                        />
                      ))}
                    </Group>
                  )}

                  {/* The die-cut edge, drawn last so it stays visible over dark artwork. */}
                  <Rect
                    x={0}
                    y={0}
                    width={labelWidth}
                    height={labelHeight}
                    stroke={active ? INSTRUMENT : CUT}
                    strokeWidth={1}
                    dash={active ? undefined : [4, 3]}
                    listening={false}
                  />
                </Group>
              )
            })}

            {/* The row after this pass, faint: it shows the gap, the cut and
                where the next labels land, and takes no edits. */}
            <Group opacity={0.4} listening={false} visible={!single}>
              {cells
                .filter((cell) => cell.row === 0)
                .map((cell) => (
                  <Group key={`next,${cell.column}`} x={cell.dx * pxPerMm} y={nextRowY * pxPerMm}>
                    <Rect x={0} y={0} width={labelWidth} height={labelHeight} fill={PAPER} />
                    {boundFor(cells.length - 1 + cell.column).map((element) => (
                      <ElementShape
                        key={element.id}
                        element={element}
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
                      width={labelWidth}
                      height={labelHeight}
                      stroke={CUT}
                      strokeWidth={1}
                      dash={[4, 3]}
                    />
                  </Group>
                ))}
            </Group>
          </Layer>

          <Layer listening={false}>
            <Rect x={0} y={0} width={size.width} height={RULER} fill={RULER_BG} />
            <Rect x={0} y={0} width={RULER} height={size.height} fill={RULER_BG} />
            <Line
              points={[0, RULER + 0.5, size.width, RULER + 0.5]}
              stroke={RULER_LINE}
              strokeWidth={1}
            />
            <Line
              points={[RULER + 0.5, 0, RULER + 0.5, size.height]}
              stroke={RULER_LINE}
              strokeWidth={1}
            />

            {xTicks.map((mm) => {
              const x = originX + mm * pxPerMm
              if (x > size.width) return null
              return (
                <Group key={`x${mm}`}>
                  <Line points={[x, RULER - 6, x, RULER]} stroke={TICK} strokeWidth={1} />
                  <Text
                    x={x + 3}
                    y={6}
                    text={String(mm)}
                    fontSize={10}
                    fontFamily={MONO}
                    fill={TICK_TEXT}
                  />
                </Group>
              )
            })}

            {yTicks.map((mm) => {
              const y = originY + mm * pxPerMm
              if (y > size.height) return null
              return (
                <Group key={`y${mm}`}>
                  <Line points={[RULER - 6, y, RULER, y]} stroke={TICK} strokeWidth={1} />
                  <Text
                    x={3}
                    y={y + 3}
                    text={String(mm)}
                    fontSize={10}
                    fontFamily={MONO}
                    fill={TICK_TEXT}
                  />
                </Group>
              )
            })}

            {/* The corner where the rulers meet covers the first tick of each,
              so it names the unit instead. */}
            <Rect x={0} y={0} width={RULER} height={RULER} fill={RULER_BG} />
            <Text x={5} y={8} text="mm" fontSize={9} fontFamily={MONO} fill={INSTRUMENT} />
          </Layer>
        </Stage>
      ) : null}

      {editing && 'value' in editing ? (
        <InlineEditor
          key={editing.id}
          value={editing.value}
          origin={{ x: originX + editing.x * pxPerMm, y: originY + editing.y * pxPerMm }}
          font={
            editing.type === 'text'
              ? {
                  // Exactly what TextShape draws with, so the editor is the text.
                  size: (editing.fontSize / CAP_RATIO) * pxPerMm,
                  family: TEXT_FONT_FAMILY,
                  bold: editing.bold ?? false,
                  scaleX: 1.2,
                  lineHeight: linePitch(editing) * pxPerMm,
                  ...(editing.maxWidth
                    ? { width: (editing.maxWidth * pxPerMm) / 1.2, align: editing.align ?? 'left' }
                    : {}),
                }
              : {
                  // A barcode's value is not the drawn text, so it gets a
                  // plain readable field at the element's corner.
                  size: 13,
                  family: 'Cascadia Mono, Consolas, monospace',
                  bold: false,
                  scaleX: 1,
                  lineHeight: 18,
                }
          }
          multiline={editing.type === 'text'}
          onCommit={(value) => {
            if (value !== editing.value) onEdit(editing.id, value)
            setEditingId(null)
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
    </div>
  )
}
