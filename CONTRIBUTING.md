# Contributing to lblr

The most useful contributions are printer reports, new symbologies and new
language backends — in that order. You do not need to be a Rust or React
developer to help with the first one.

## Reporting a printer

This is the single most valuable thing you can send, and it takes five minutes.

Hold **FEED** while switching the printer on. It prints a configuration label
naming the firmware and the active command language. Open an issue with:

- the model, as printed on the label rather than on the box
- a photo or transcription of that configuration label
- the resolution (203 or 300 dpi for almost all desktop units)
- whether `pnpm dev` → **Print** → **Test connection** reached it, if networked
- a photo of a label lblr printed, if you got that far

A report saying "this model does not work" is as useful as one saying it does,
provided the configuration label is attached.

## Development

Requires **Node 20+**, **pnpm 9+** and **Rust stable**. On Windows you also need
the MSVC build tools and the WebView2 runtime (preinstalled on Windows 11).

```bash
pnpm install
pnpm dev          # the desktop app, with hot reload
pnpm test         # vitest across every package
pnpm typecheck
```

`apps/desktop` also has a `pnpm vite` script that serves the designer in an
ordinary browser tab. The canvas, the inspector and both compilers work there;
only printing needs the desktop shell, and it says so rather than failing
silently. It is the faster loop for canvas work.

### Windows: several Visual Studio installs

`pnpm dev` and `pnpm build` route cargo through `scripts/with-msvc.mjs`. rustc
and cc-rs both pick the *newest* Visual Studio install they can find, which
breaks as soon as a newer install has an incomplete C++ workload — the symptom
is `LNK1104: cannot open msvcrt.lib`, or `C1083: Cannot open include file:
'excpt.h'` from a native build script. The wrapper asks vswhere for an install
that actually carries the x64 C++ tools and seeds the environment from it.

If you call `cargo` directly you get the unwrapped behaviour, so either go
through the pnpm scripts or work from a Visual Studio developer prompt.

### Windows: building inside OneDrive

Rust's `target/` directory reaches several gigabytes and OneDrive will try to
sync every incremental artifact. Point Cargo somewhere local — create
`.cargo/config.toml`, which is gitignored:

```toml
[build]
target-dir = "C:/Users/you/.cargo-target/lblr"
```

## How the pieces fit

```
packages/core       the label model. No I/O, no printer knowledge.
packages/tspl       LabelTemplate -> TSPL
packages/zpl        LabelTemplate -> ZPL
packages/transport  bytes -> a network printer or a file, from Node
apps/desktop        the designer, and the Rust backend that reaches a
                    local print queue
```

The rule that keeps this honest: **`core` never learns about a printer, and the
compilers never learn about a transport.** A template compiled to TSPL is a
string; what carries that string is somebody else's problem. That is why the
packages are usable from a Node service or a CLI with no Tauri anywhere.

Millimetres are the authoring unit everywhere above the compilers. Dots appear
exactly once, at compile time, through `mmToDots`. If you find yourself
converting to dots anywhere else, that is the bug.

## Adding a symbology

1. Add it to `LinearSymbology` in `packages/core/src/types.ts`.
2. Map it in `packages/tspl/src/symbology.ts` and `packages/zpl/src/symbology.ts`.
   A symbology one backend cannot express should be listed as unsupported there
   rather than silently approximated.
3. Add content rules to `checkSymbologyContent` in `packages/core/src/validate.ts`
   — EAN-13 wants 12 or 13 digits, Codabar wants A–D delimiters, and so on.
   Catching it in the validator means the operator sees it before the media is
   wasted.
4. Add a compile test to both backends asserting the emitted command.

## Adding a language backend

Copy the shape of `packages/tspl`: a `Builder` that accumulates commands, a
`symbology` map, and a `compile`/`compileJob`/`compileBatch` trio with the same
signatures. Nothing else in the tree needs to know the backend exists until the
designer's language picker gains an entry.

## Tests

`pnpm test` must pass before a pull request. Compiler tests assert on the exact
emitted command string — that is deliberate, because a silent change in what
reaches the printer is exactly the kind of regression that is expensive to find
from a photo of a bad label.

Tests should not need a printer. `packages/transport` tests run against a
loopback socket standing in for one.

## Style

Prettier settles formatting: `pnpm format`. Beyond that, comments should explain
why something is the way it is — thermal printing is full of constraints that
look arbitrary until someone writes down which scanner or which firmware quirk
is behind them. Those are the comments worth having.

## Licence

By contributing you agree your work is published under the [MIT licence](LICENSE).
