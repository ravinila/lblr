#!/usr/bin/env node
// Writes the updater manifest (latest.json) for a release.
//
// The installed app fetches this file from the latest GitHub release and
// compares its version with its own. The signature is the contents of the
// `.sig` file that `tauri build` writes next to the installer when
// `bundle.createUpdaterArtifacts` is on and a signing key is in the
// environment.
//
// usage: node scripts/release-manifest.mjs <version> <bundle-dir> [notes-file]
//   writes <bundle-dir>/latest.json and prints the files to upload.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [version, bundleDir, notesFile] = process.argv.slice(2)
if (!version || !bundleDir) {
  console.error('usage: release-manifest <version> <bundle-dir> [notes-file]')
  process.exit(2)
}

const repo = 'ravinila/lblr'
const installer = `lblr_${version}_x64-setup.exe`
const installerPath = join(bundleDir, 'nsis', installer)
const signaturePath = `${installerPath}.sig`

for (const path of [installerPath, signaturePath]) {
  if (!existsSync(path)) {
    console.error(`missing ${path}; build with createUpdaterArtifacts and a signing key first`)
    process.exit(1)
  }
}

const manifest = {
  version,
  notes: notesFile ? readFileSync(notesFile, 'utf8').trim() : `lblr ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(signaturePath, 'utf8').trim(),
      url: `https://github.com/${repo}/releases/download/v${version}/${installer}`,
    },
  },
}

const out = join(bundleDir, 'latest.json')
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(out)
console.log(installerPath)
console.log(signaturePath)
console.log(join(bundleDir, 'msi', `lblr_${version}_x64_en-US.msi`))
