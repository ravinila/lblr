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

import { Group, Line as KonvaLine, Rect, Text as KonvaText } from 'react-konva'
import {
  estimateBarcodeWidth,
  estimateQrSize,
  moduleDots,
  unrotatedSize,
  type BarcodeElement,
  type LabelElement,
  type QrElement,
  type TextElement,
} from '@lblr/core'

/** Cap height as a fraction of em for the printers' internal font. */
const CAP_RATIO = 0.72

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

  return (
    <KonvaText
      x={0}
      y={0}
      text={element.value}
      fontSize={fontSize}
      fontFamily="Arial Narrow, Segoe UI, sans-serif"
      fontStyle={element.bold ? 'bold' : 'normal'}
      fill={BURN}
      // Approximates the condensed internal font rather than leaving the
      // preview noticeably wider than the print.
      scaleX={CONDENSED_ASPECT / 0.5}
      {...(element.maxWidth
        ? {
            width: (element.maxWidth * pxPerMm) / (CONDENSED_ASPECT / 0.5),
            align: element.align ?? 'left',
            lineHeight: 1 + (element.lineGap ?? 0) / Math.max(element.fontSize, 0.1),
          }
        : {})}
      listening={false}
    />
  )
}

interface ShapeProps<T extends LabelElement> {
  element: T
  pxPerMm: number
  dpi: number
}

export interface ElementShapeProps {
  element: LabelElement
  pxPerMm: number
  dpi: number
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
}

export function ElementShape({
  element,
  pxPerMm,
  dpi,
  selected,
  onSelect,
  onMove,
}: ElementShapeProps) {
  if (element.hidden) return null

  const size = unrotatedSize(element)
  const width = size.width * pxPerMm
  const height = size.height * pxPerMm

  return (
    <Group
      x={element.x * pxPerMm}
      y={element.y * pxPerMm}
      rotation={element.rotation ?? 0}
      draggable={!element.locked}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onMove(event.target.x() / pxPerMm, event.target.y() / pxPerMm)}
    >
      {/*
        A transparent hit area: bars and glyphs leave gaps, and clicking the gap
        between two bars should still grab the barcode.
      */}
      <Rect x={0} y={0} width={width} height={height} fill="transparent" />

      {element.type === 'text' ? <TextShape element={element} pxPerMm={pxPerMm} dpi={dpi} /> : null}
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

      {selected ? (
        <Rect
          x={-1}
          y={-1}
          width={width + 2}
          height={height + 2}
          stroke="#4cc3f0"
          strokeWidth={1}
          listening={false}
        />
      ) : null}
    </Group>
  )
}
