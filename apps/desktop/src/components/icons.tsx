/**
 * The handful of glyphs the interface needs, inline so they follow the text
 * colour and never wait on a network the desktop shell does not allow.
 * Every icon is drawn on a 16-unit grid with a 1.5 stroke.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const TextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3.5h10M8 3.5v9M5.5 12.5h5" />
  </Svg>
)

export const BarcodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 3v10M4.5 3v10M7 3v7M9 3v10M11.5 3v7M14 3v10" />
  </Svg>
)

export const QrIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2" width="5" height="5" rx="0.5" />
    <rect x="9" y="2" width="5" height="5" rx="0.5" />
    <rect x="2" y="9" width="5" height="5" rx="0.5" />
    <path d="M9 9h2v2H9zM12 9h2M9 13h2M13 12v2" />
  </Svg>
)

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
  </Svg>
)

export const LineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 11.5l11-7" />
  </Svg>
)

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3" width="11" height="10" rx="1" />
    <path d="M3 11l3-3 3 3 2-2 2.5 2.5" />
    <circle cx="10.5" cy="6" r="1" />
  </Svg>
)

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
)

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 2l12 12M6.3 6.4A2 2 0 0 0 9.6 9.7M4.2 4.4C2.4 5.6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.2 0 2.2-.3 3.1-.8M6.8 3.7c.4-.1.8-.2 1.2-.2 4 0 6.5 4.5 6.5 4.5s-.6 1.1-1.7 2.2" />
  </Svg>
)

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
)

export const UnlockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" />
  </Svg>
)

export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5l6 10.5H2z" />
    <path d="M8 6.5v3M8 11.5v.2" />
  </Svg>
)

export const ErrorIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.3 8.2l1.8 1.8 3.6-3.8" />
  </Svg>
)

export const PrintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6V2.5h7V6M4.5 11.5h7V14h-7z" />
    <rect x="2" y="6" width="12" height="5.5" rx="1" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
)

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4.5A1 1 0 0 1 3 3.5h3.2l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
  </Svg>
)

export const SaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3h8l2 2v8H3z" />
    <path d="M5.5 3v3.5h5V3M5.5 13V9.5h5V13" />
  </Svg>
)

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4L3 7l3 3" />
    <path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H8" />
  </Svg>
)

export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4l3 3-3 3" />
    <path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H8" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </Svg>
)

export const UpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Svg>
)

export const DownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M4 9l4 4 4-4" />
  </Svg>
)

export const GripIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={0} fill="currentColor">
    <circle cx="6" cy="4" r="1.2" />
    <circle cx="10" cy="4" r="1.2" />
    <circle cx="6" cy="8" r="1.2" />
    <circle cx="10" cy="8" r="1.2" />
    <circle cx="6" cy="12" r="1.2" />
    <circle cx="10" cy="12" r="1.2" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
)

export const LabelMarkIcon = (p: IconProps) => (
  <Svg {...p} stroke="#ffffff" strokeWidth={1.8}>
    <path d="M3 4h10v8H3zM5.5 6.5v3M8 6.5v3M10.5 6.5v3" />
  </Svg>
)

export function elementIcon(type: string) {
  switch (type) {
    case 'text':
      return <TextIcon />
    case 'barcode':
      return <BarcodeIcon />
    case 'qrcode':
      return <QrIcon />
    case 'box':
      return <BoxIcon />
    case 'line':
      return <LineIcon />
    default:
      return <ImageIcon />
  }
}
