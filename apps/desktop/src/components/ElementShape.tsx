/**
 * Drawing one label element on the preview canvas.
 *
 * Geometry here is exact: every position, size and module width is the value
 * the compiler will emit, converted through the same `mmToDots` the printer
 * will see. What is *not* exact is the bar and module pattern inside a barcode
 * or QR symbol — encoding those faithfully would mean shipping a second
 * implementation of every symbology, and the printer's own firmware is the one
 * that draws them in the end.
 *
 * So the symbols below are drawn at the correct overall size with correctly
 * sized modules, filled with a pattern derived from the value. That is what the
 * canvas is for — deciding whether the barcode fits, clears its quiet zone and
 * sits where you want it. Whether it scans is decided by the module width, and
 * the validator checks that independently.
 */

import { forwardRef } from 'react'
import type Konva from 'konva'
import { Group, Line as KonvaLine, Rect, Text as KonvaText } from 'react-konva'
import {
  estimateBarcodeWidth,
  estimateQrSize,
  lineOffset,
  linePitch,
  moduleDots,
  snapMm,
  textLineWidth,
  unrotatedSize,
  wrapText,
  type BarcodeElement,
  type LabelElement,
  type QrElement,
  type TextElement,
} from '@lblr/core'

/** Cap height as a fraction of em for the printers' internal font. */
export const CAP_RATIO = 0.72

/** The face the canvas draws text with; the in-place editor uses the same. */
export const TEXT_FONT_FAMILY = 'Arial Narrow, Segoe UI, sans-serif'

/** The printers' internal font is a condensed grotesque; approximate its width. */
const CONDENSED_ASPECT = 0.6

const BURN = '#16191a'

/**
 * A stable pseudo-random stream from the element's value, so a given payload
 * always draws the same pattern and the canvas does not shimmer while typing
 * elsewhere.
 */
function* patternBits(seed: string): Generator<number> {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  }
  for (;;) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    yield (hash >>> 0) % 4
  }
}

function BarcodeShape({ element, pxPerMm, dpi }: ShapeProps<BarcodeElement>) {
  const module = moduleDots(element.moduleWidth ?? 0.25, dpi) * (pxPerMm / (dpi / 25.4))
  const totalWidth = estimateBarcodeWidth(element) * pxPerMm
  const barsHeight = element.height * pxPerMm

  const bars: Array<{ x: number; width: number }> = []
  const bits = patternBits(element.value || element.id)
  let x = 0
  let drawing = true

  while (x < totalWidth - module) {
    const width = ((bits.next().value ?? 0) + 1) * module
    if (drawing) bars.push({ x, width: Math.min(width, totalWidth - x) })
    x += width
    drawing = !drawing
  }

  return (
    <>
      {bars.map((bar, index) => (
        <Rect
          key={index}
          x={bar.x}
          y={0}
          width={bar.width}
          height={barsHeight}
          fill={BURN}
          listening={false}
        />
      ))}
      {element.humanReadable ? (
        <KonvaText
          x={0}
          y={barsHeight + 0.5 * pxPerMm}
          width={totalWidth}
          text={element.value}
          fontSize={2.5 * pxPerMm * CAP_RATIO * 1.4}
          fontFamily="Arial Narrow, Segoe UI, sans-serif"
          fill={BURN}
          align="center"
          listening={false}
        />
      ) : null}
    </>
  )
}

function QrShape({ element, pxPerMm }: ShapeProps<QrElement>) {
  const side = estimateQrSize(element) * pxPerMm
  const module = element.moduleWidth * pxPerMm
  const count = Math.max(1, Math.round(side / module))
  const bits = patternBits(element.value || element.id)

  const cells: Array<{ x: number; y: number }> = []
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      // Finder patterns in three corners, so the symbol reads as a QR code.
      const inFinder =
        (row < 7 && column < 7) ||
        (row < 7 && column >= count - 7) ||
        (row >= count - 7 && column < 7)

      if (inFinder) {
        const r = row < 7 ? row : count - 1 - row
        const c = column < 7 ? column : count - 1 - column
        const ring = Math.max(Math.min(r, 6 - r), Math.min(c, 6 - c))
        if (ring === 0 || ring === 2 || ring === 3) cells.push({ x: column, y: row })
        continue
      }

      if ((bits.next().value ?? 0) % 2 === 0) cells.push({ x: column, y: row })
    }
  }

  return (
    <>
      {cells.map((cell) => (
        <Rect
          key={`${cell.x}:${cell.y}`}
          x={cell.x * module}
          y={cell.y * module}
          width={module}
          height={module}
          fill={BURN}
          listening={false}
        />
      ))}
    </>
  )
}

function TextShape({ element, pxPerMm }: ShapeProps<TextElement>) {
  // The model stores cap height; Konva wants em size.
  const fontSize = (element.fontSize / CAP_RATIO) * pxPerMm

  // The lines are broken by the same function the compilers use, and each is
  // drawn on its own, so a wrap on screen is a wrap on the printer.
  const lines = wrapText(element.value, element.fontSize, element.maxWidth)
  const pitch = linePitch(element) * pxPerMm
  const scaleX = CONDENSED_ASPECT / 0.5

  // Alignment inside the wrap width is done by Konva from the glyphs it
  // actually draws, not from the width estimate, so centred text sits in
  // the centre of its box on screen. The printer does the same with its own
  // glyphs; both are true to what they draw.
  const boxed = element.maxWidth !== undefined && element.maxWidth > 0

  return (
    <>
      {lines.map((line, index) => (
        <KonvaText
          key={index}
          x={0}
          y={index * pitch}
          text={line}
          fontSize={fontSize}
          fontFamily={TEXT_FONT_FAMILY}
          fontStyle={element.bold ? 'bold' : 'normal'}
          fill={BURN}
          // Approximates the condensed internal font rather than leaving the
          // preview noticeably wider than the print.
          scaleX={scaleX}
          {...(boxed
            ? {
                width: ((element.maxWidth ?? 0) * pxPerMm) / scaleX,
                align: element.align ?? 'left',
              }
            : {})}
          wrap="none"
          listening={false}
        />
      ))}
    </>
  )
}

interface ShapeProps<T extends LabelElement> {
  element: T
  pxPerMm: number
  dpi: number
}

/**
 * What a resize handle means for each kind of element. Scale factors come
 * from the transformer; the element's own property is what changes, and the
 * numbers land on the same steps the inspector uses so a drag and a typed
 * value never disagree.
 */
export function resizedElement(
  element: LabelElement,
  scaleX: number,
  scaleY: number,
): Partial<LabelElement> {
  const tenth = (value: number) => Math.round(value * 10) / 10
  const twentieth = (value: number) => Math.round(value * 20) / 20
  switch (element.type) {
    case 'text': {
      // A side handle only changes the box width, and gives the text a box
      // if it had none. A corner scales the type, and the box with it.
      const width =
        element.maxWidth ??
        wrapText(element.value, element.fontSize).reduce(
          (widest, line) => Math.max(widest, textLineWidth(line, element.fontSize)),
          0,
        )
      if (Math.abs(scaleY - 1) < 1e-6) {
        return { maxWidth: Math.max(1, tenth(width * scaleX)) }
      }
      return {
        fontSize: Math.max(0.5, tenth(element.fontSize * scaleY)),
        ...(element.maxWidth ? { maxWidth: Math.max(1, tenth(element.maxWidth * scaleX)) } : {}),
      }
    }
    case 'barcode':
      return {
        height: Math.max(1, tenth(element.height * scaleY)),
        moduleWidth: Math.max(0.05, twentieth((element.moduleWidth ?? 0.25) * scaleX)),
      }
    case 'qrcode':
      return { moduleWidth: Math.max(0.05, twentieth(element.moduleWidth * scaleY)) }
    case 'box':
      return {
        width: Math.max(0.5, tenth(element.width * scaleX)),
        height: Math.max(0.5, tenth(element.height * scaleY)),
      }
    case 'line':
      return { length: Math.max(0.5, tenth(element.length * scaleX)) }
    case 'image':
      return {
        width: Math.max(0.5, tenth(element.width * scaleX)),
        height: Math.max(0.5, tenth(element.height * scaleY)),
      }
  }
}

/** Which handles a transformer shows for each kind of element, and whether they keep the shape. */
export function resizeHandles(element: LabelElement): { anchors: string[]; keepRatio: boolean } {
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  const sides = ['top-center', 'middle-right', 'bottom-center', 'middle-left']
  switch (element.type) {
    case 'text':
      // Corners scale the type; the sides set the box width.
      return { anchors: [...corners, 'middle-left', 'middle-right'], keepRatio: true }
    case 'qrcode':
      return { anchors: corners, keepRatio: true }
    case 'line':
      return { anchors: ['middle-left', 'middle-right'], keepRatio: false }
    default:
      return { anchors: [...corners, ...sides], keepRatio: false }
  }
}

export interface ElementShapeProps {
  element: LabelElement
  pxPerMm: number
  dpi: number
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  /** A resize handle was released; the patch is the element's new geometry. */
  onResize?: (patch: Partial<LabelElement>) => void
  /** The element was double-clicked: open its value for editing. */
  onEdit?: () => void
  /**
   * Called for every drag step with the would-be position in millimetres;
   * returns the position to use, nudged onto any guide within reach.
   */
  onDragSnap?: (x: number, y: number) => { x: number; y: number }
  /** The value is open in the in-place editor, which draws the text itself. */
  editing?: boolean
  /** The label the element lives on, so a drag cannot push it off the edge. */
  label?: { width: number; height: number }
}

export const ElementShape = forwardRef<Konva.Group, ElementShapeProps>(function ElementShape(
  {
    element,
    pxPerMm,
    dpi,
    selected,
    onSelect,
    onMove,
    onResize,
    onEdit,
    onDragSnap,
    editing,
    label,
  },
  ref,
) {
  if (element.hidden) return null

  const size = unrotatedSize(element)
  const width = size.width * pxPerMm
  const height = size.height * pxPerMm

  // Keep the whole element on the label while it is dragged. Only unrotated
  // elements are clamped: a rotated bounding box pivots about its corner and
  // the arithmetic is not worth getting wrong.
  const dragBound = (node: Konva.Node, pos: { x: number; y: number }) => {
    if ((element.rotation ?? 0) !== 0) return pos
    const parent = node.getParent()
    if (!parent) return pos
    const origin = parent.getAbsolutePosition()

    // Smart guides first, so a snapped position is what gets clamped.
    let { x, y } = pos
    if (onDragSnap) {
      const snapped = onDragSnap((x - origin.x) / pxPerMm, (y - origin.y) / pxPerMm)
      x = origin.x + snapped.x * pxPerMm
      y = origin.y + snapped.y * pxPerMm
    }
    if (!label) return { x, y }
    const maxX = origin.x + Math.max(0, label.width * pxPerMm - width)
    const maxY = origin.y + Math.max(0, label.height * pxPerMm - height)
    return {
      x: Math.min(maxX, Math.max(origin.x, x)),
      y: Math.min(maxY, Math.max(origin.y, y)),
    }
  }

  return (
    <Group
      ref={ref}
      x={element.x * pxPerMm}
      y={element.y * pxPerMm}
      rotation={element.rotation ?? 0}
      draggable={!element.locked}
      dragBoundFunc={function (this: Konva.Node, pos) {
        return dragBound(this, pos)
      }}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragEnd={(event) => onMove(event.target.x() / pxPerMm, event.target.y() / pxPerMm)}
      onTransformEnd={(event) => {
        // The transformer scales the node; the model wants real sizes, so the
        // scale is read, reset, and turned into millimetres.
        const node = event.target
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        onResize?.({
          ...resizedElement(element, scaleX, scaleY),
          x: snapMm(node.x() / pxPerMm, dpi),
          y: snapMm(node.y() / pxPerMm, dpi),
        })
      }}
    >
      {/*
        A transparent hit area: bars and glyphs leave gaps, and clicking the gap
        between two bars should still grab the barcode.
      */}
      <Rect x={0} y={0} width={width} height={height} fill="transparent" />

      {element.type === 'text' ? (
        <Group opacity={editing ? 0 : 1}>
          <TextShape element={element} pxPerMm={pxPerMm} dpi={dpi} />
        </Group>
      ) : null}
      {element.type === 'barcode' ? (
        <BarcodeShape element={element} pxPerMm={pxPerMm} dpi={dpi} />
      ) : null}
      {element.type === 'qrcode' ? <QrShape element={element} pxPerMm={pxPerMm} dpi={dpi} /> : null}

      {element.type === 'box' ? (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke={element.filled ? undefined : BURN}
          strokeWidth={element.thickness * pxPerMm}
          fill={element.filled ? BURN : undefined}
          listening={false}
        />
      ) : null}

      {element.type === 'line' ? (
        <KonvaLine
          points={[0, 0, element.length * pxPerMm, 0]}
          stroke={BURN}
          strokeWidth={element.thickness * pxPerMm}
          listening={false}
        />
      ) : null}

      {element.type === 'image' ? (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke="#9aa8a4"
          strokeWidth={1}
          dash={[4, 3]}
          listening={false}
        />
      ) : null}

      {/* The selection outline is drawn by the canvas's transformer when
          handles are available; this one covers the read-only previews. */}
      {selected && !onResize ? (
        <Rect
          x={-1}
          y={-1}
          width={width + 2}
          height={height + 2}
          stroke="#2563eb"
          strokeWidth={1}
          listening={false}
        />
      ) : null}
    </Group>
  )
})
