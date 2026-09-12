# lblr

**Design it. Print it.** An open-source label designer and print engine for thermal barcode printers.

Most label software is either closed and expensive (BarTender, NiceLabel) or locked to one vendor
(ZebraDesigner, P-touch Editor). The open-source projects that do exist almost all speak **ZPL** only,
which leaves every **TSPL** printer — TSC, TVS, Godex, and the many rebrands — without a free option.

lblr targets both, from one label document.

> Status: early, but end to end. The core model, both compilers, the raw print
> path and the designer canvas all work. Verified against one printer so far —
> reports for other models are very welcome.

---

## Why it's built this way

A label is not a web page. At 203 dpi, one millimetre is exactly 8 dots, and a barcode whose module
width rounds to a fraction of a dot is a barcode that scanners refuse to read. So lblr never rasterises
through a print driver. It compiles your label to the printer's own command language and sends those
bytes straight to the device.

```
  LabelTemplate (mm)  ──▶  compile(template, data, {dpi})  ──▶  TSPL / ZPL  ──▶  raw transport
       │                                                                            │
       └──▶ Konva canvas preview at true device dpi                    USB · spooler · TCP:9100
```

The same template renders in the designer and on the printer because both consume the same model.

## Features

- **Two printer languages.** TSPL/TSPL2 and ZPL II from one template, chosen per device.
- **Native barcodes.** Emits the printer's own `BARCODE`/`^BC` commands rather than images — sharper,
  and an order of magnitude faster to transmit.
- **True-dpi preview.** The canvas renders at the target device resolution, so what you see is what burns.
- **Data binding.** `{{sku}}` placeholders filled from the built-in data sheet: paste rows from a
  spreadsheet or import a CSV, preview any row on the canvas, and print the whole sheet as one job.
- **Starter designs.** New labels begin from a gallery of designs that lay themselves out for the
  chosen size: product tag, QR tag, price tag, address, shipping and framed text.
- **A real editor.** Resize with handles, hold Alt to scale from the centre, double-click text to
  edit it in place, drag rows to restack, and snap to smart guides while moving.
- **Direct printing.** Windows spooler RAW, TCP port 9100, and USB — no print dialog, no scaling.
- **Millimetre-native.** Authoring is in mm; dot conversion happens once, at compile time.
- **Stock presets.** New labels start from the die-cut sizes suppliers actually sell, 25 × 15 up to 4 × 6 in.
- **Multi-column rolls.** Tell the label how many sit across the roll and what separates them. The
  designer draws the whole strip on its liner, the print preview shows one pass exactly as the
  printer will burn it, and the printer sees a single label of the combined size.
- **Text size check.** Some printers draw their built-in font larger than the dot size asked for.
  Print the check once, measure it with a ruler, and every text is corrected from then on.
- **Printer setup from the dialog.** Calibrate the gap sensor, feed one label, set where the
  label stops against the tear bar, and shift the print in any direction, all saved with the label.
- **Remembers where you were.** The document, its sample values and the printer choice survive a
  restart.

## Install

Prebuilt binaries are not published yet. To run from source see [Development](#development).

## Quick start

```ts
import { createTemplate, text, barcode } from '@lblr/core'
import { compile } from '@lblr/tspl'

const template = createTemplate({
  name: 'part-tag',
  width: 50, // mm
  height: 25, // mm
  gap: 2, // mm between labels
  elements: [
    text({ x: 3, y: 3, value: '{{name}}', fontSize: 3.5, bold: true }),
    barcode({ x: 3, y: 10, value: '{{sku}}', symbology: 'code128', height: 10 }),
  ],
})

const commands = compile(template, { name: 'ACME Bearing', sku: '7894561230' }, { dpi: 203 })
```

Send it with the desktop app, or over the network:

```ts
import { printTcp } from '@lblr/transport'
await printTcp('192.168.1.50', 9100, commands)
```

## Designer shortcuts

| Keys                        | Action                                          |
| --------------------------- | ----------------------------------------------- |
| Ctrl + wheel                | Zoom the label                                  |
| Ctrl + `=` / Ctrl + `-`     | Zoom in / out a step                            |
| Ctrl + `0`                  | Fit the roll to the window                      |
| Ctrl + `1`                  | One screen pixel per printer dot                |
| Ctrl + N / O / S / P        | New, open, save, preview and print              |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo                                     |
| Arrows / Shift + arrows     | Nudge the selection by one dot / one millimetre |

## Which language does my printer speak?

Hold **FEED** while powering the printer on. It prints a configuration label naming the firmware and
active command language.

| Printer family                      | Language               |
| ----------------------------------- | ---------------------- |
| TSC, TVS Electronics, Godex, Rongta | TSPL / TSPL2           |
| Zebra                               | ZPL II                 |
| Honeywell/Intermec, Argox           | often both, switchable |

Many non-Zebra printers also ship a ZPL emulation mode. If yours does, either backend works.

Verified so far: **TVS Electronics LP 46 Neo** (203 dpi). Its firmware draws the built-in font at
roughly twice the requested size and wraps `BLOCK` text unreliably, so lblr breaks lines itself
and ships a text size check to measure the correction. Reports for other models are very welcome —
open an issue with your configuration label and we'll add it.

## Repository layout

```
lblr/
├── packages/
│   ├── core/        @lblr/core       label document model, units, data binding
│   ├── tspl/        @lblr/tspl       TSPL/TSPL2 compiler
│   ├── zpl/         @lblr/zpl        ZPL II compiler
│   └── transport/   @lblr/transport  TCP and file transports (Node)
├── apps/
│   └── desktop/     Tauri 2 + React designer
│       ├── src/         the canvas, inspector and print dialog
│       └── src-tauri/   Rust: printer discovery and raw byte transport
├── examples/        label files to open in the designer
└── scripts/
    └── with-msvc.mjs    picks a working MSVC toolchain on Windows
```

The packages carry no Tauri dependency and are usable on their own — in a Node service, a CLI, or
someone else's app. That is deliberate.

## Development

Requires **Node 20+**, **pnpm 9+**, **Rust stable**, and on Windows the **MSVC build tools** plus the
**WebView2 runtime** (preinstalled on Windows 11).

```bash
pnpm install
pnpm dev          # launch the desktop app with HMR
pnpm test         # vitest across all packages
pnpm typecheck
```

The designer also runs in an ordinary browser tab — `pnpm --filter @lblr/desktop
vite` — which is the quicker loop for canvas work. Everything but printing
works there, and the print dialog says so rather than failing quietly.

<details>
<summary>Windows: several Visual Studio installs</summary>

`pnpm dev` and `pnpm build` route cargo through `scripts/with-msvc.mjs`. rustc and cc-rs both pick the
_newest_ Visual Studio install they can find, so a newer install with an incomplete C++ workload breaks
the build — `LNK1104: cannot open msvcrt.lib`, or `C1083: Cannot open include file: 'excpt.h'`. The
wrapper asks vswhere for an install that actually carries the x64 C++ tools and seeds the environment
from that one.

Calling `cargo` directly skips the wrapper, so use the pnpm scripts or a Visual Studio developer prompt.
</details>

<details>
<summary>Windows: building inside OneDrive</summary>

Rust's `target/` directory reaches several gigabytes and OneDrive will try to sync every incremental
build artifact. Point Cargo somewhere local instead — create `.cargo/config.toml` (already gitignored):

```toml
[build]
target-dir = "C:/Users/you/.cargo-target/lblr"
```

</details>

## Contributing

New printer models, symbologies and language backends are the most useful contributions — see
[CONTRIBUTING.md](CONTRIBUTING.md). The compiler design makes adding a third language (EPL, CPCL,
ESC/POS) a matter of implementing one interface.

## License

[MIT](LICENSE)
