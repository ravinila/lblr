#!/usr/bin/env node
// Runs a command with the MSVC build environment seeded, on Windows only.
//
// Why this exists: rustc and cc-rs both resolve the *newest* Visual Studio
// install they can find. A machine can easily carry a newer install whose C++
// workload is incomplete — VS 18 Community shipping only `lib\onecore`, say —
// and the build then dies with `LNK1104: cannot open msvcrt.lib`, or with
// `C1083: Cannot open include file: 'excpt.h'` from a native build script.
//
// vswhere can filter on the component that actually matters, so we ask for an
// install that really has the x64 C++ tools and seed the environment from its
// vcvars64.bat. Everywhere other than Windows this is a straight passthrough.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.error('usage: with-msvc <command> [args...]')
  process.exit(2)
}

/** Locate a VS install that carries the x64 C++ toolchain, not merely the newest one. */
function findVcvars() {
  const vswhere = join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  )
  if (!existsSync(vswhere)) return null

  const result = spawnSync(
    vswhere,
    [
      '-products', '*',
      '-latest',
      '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property', 'installationPath',
    ],
    { encoding: 'utf8' },
  )
  const root = result.stdout?.trim().split(/\r?\n/)[0]
  if (!root) return null

  const vcvars = join(root, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
  return existsSync(vcvars) ? vcvars : null
}

/** Capture the environment that vcvars64.bat produces. */
function msvcEnv(vcvars) {
  // `set` after the batch file gives us the whole environment it built.
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `call "${vcvars}" >nul 2>&1 && set`], {
    encoding: 'utf8',
    windowsVerbatimArguments: true,
  })
  if (result.status !== 0 || !result.stdout) return null

  const env = { ...process.env }
  for (const line of result.stdout.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  // cc-rs only trusts the ambient environment when this is set; vcvars sets it,
  // but assert it so a silent miss surfaces here rather than inside a build script.
  return env.VCINSTALLDIR ? env : null
}

let env = process.env

if (process.platform === 'win32' && !process.env.VCINSTALLDIR) {
  const vcvars = findVcvars()
  if (vcvars) {
    const seeded = msvcEnv(vcvars)
    if (seeded) env = seeded
    else console.warn(`with-msvc: could not read the environment from ${vcvars}; continuing as-is`)
  } else {
    console.warn(
      'with-msvc: no Visual Studio install with the x64 C++ tools was found.\n' +
        '           Install "Desktop development with C++" (or at least the\n' +
        '           "MSVC v143 C++ x64/x86 build tools" component) and try again.',
    )
  }
}

// On Windows the target is often a `.cmd` shim (pnpm, vite), which Node refuses
// to spawn directly, so go through cmd.exe with a hand-quoted command line.
// `shell: true` is not an option here: it concatenates args without escaping.
const quote = (arg) => (/[\s&|<>^"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)

const child =
  process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[command, ...args].map(quote).join(' ')}"`], {
        stdio: 'inherit',
        env,
        windowsVerbatimArguments: true,
      })
    : spawn(command, args, { stdio: 'inherit', env })

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
child.on('error', (error) => {
  console.error(`with-msvc: failed to run ${command}: ${error.message}`)
  process.exit(1)
})
