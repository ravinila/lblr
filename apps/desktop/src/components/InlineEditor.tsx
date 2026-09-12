/**
 * Editing text where it sits on the canvas.
 *
 * Konva draws to a bitmap, so editing happens in an HTML element laid over
 * the stage. The element is styled to be indistinguishable from the drawn
 * text: same face, size, weight, condensed width and line pitch, no border
 * and no background. The canvas hides its own copy of the text while this is
 * open, so what the person sees is the text itself with a caret in it.
 *
 * Enter starts a new line, as in any editor. Escape and clicking elsewhere
 * finish the edit and keep it; undo is a Ctrl+Z away afterwards. A single-
 * line value, such as a barcode's, commits on Enter instead.
 */

import { useEffect, useRef, type CSSProperties } from 'react'

export interface EditorFont {
  /** CSS font size in pixels, the em size the canvas draws with. */
  size: number
  family: string
  bold: boolean
  /** Horizontal squeeze the canvas applies to approximate the printer's face. */
  scaleX: number
  /** Distance between lines in pixels, matching the canvas. */
  lineHeight: number
  /** Wrap width in unscaled pixels, when the text wraps. */
  width?: number
  align?: 'left' | 'center' | 'right'
}

export interface InlineEditorProps {
  value: string
  /** Top-left of the text over the stage, in pixels. */
  origin: { x: number; y: number }
  font: EditorFont
  multiline: boolean
  onCommit: (value: string) => void
  onCancel: () => void
}

export function InlineEditor({
  value,
  origin,
  font,
  multiline,
  onCommit,
  onCancel,
}: InlineEditorProps) {
  const field = useRef<HTMLDivElement>(null)
  // Commit and cancel each end the edit once; the blur that follows either
  // must not fire again.
  const done = useRef(false)

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.textContent = value
    element.focus()
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }, [value])

  const read = () => (field.current?.innerText ?? '').replace(/\r/g, '').replace(/\n$/, '')

  const commit = () => {
    if (done.current) return
    done.current = true
    onCommit(read())
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }

  // The canvas draws each line top-aligned in a box one em tall, then steps
  // by the line pitch. CSS centres glyphs in the line box, so the whole
  // element shifts up by half the difference to land on the same pixels.
  const style: CSSProperties = {
    left: origin.x,
    top: origin.y - (font.lineHeight - font.size) / 2,
    fontSize: font.size,
    fontFamily: font.family,
    fontWeight: font.bold ? 'bold' : 'normal',
    lineHeight: `${font.lineHeight}px`,
    transform: `scaleX(${font.scaleX})`,
    width: font.width,
    textAlign: font.align ?? 'left',
    whiteSpace: font.width ? 'pre-wrap' : 'pre',
  }

  return (
    <div
      ref={field}
      className="inline-editor"
      style={style}
      role="textbox"
      aria-multiline={multiline}
      // Chromium keeps this to plain text, so Enter is a newline and pasted
      // markup never reaches the label.
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(event) => {
        // The designer's shortcuts must not see these keys.
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          if (event.shiftKey) cancel()
          else commit()
        } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          commit()
        }
      }}
      onPaste={(event) => {
        if (multiline) return
        // A single-line value drops any line breaks in what was pasted.
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')
        document.execCommand('insertText', false, text)
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
