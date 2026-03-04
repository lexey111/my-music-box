#!/usr/bin/env node
// Patches the local Electron binary so the app appears as "My Music Box"
// in the macOS menu bar, Dock, and Command+Tab during development.
// Runs automatically via postinstall; safe to re-run at any time.

const { execSync } = require('child_process')
const { existsSync, copyFileSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const plist = join(root, 'node_modules/electron/dist/Electron.app/Contents/Info.plist')
const iconSrc = join(root, 'build/icon.icns')
const iconDst = join(root, 'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns')

if (!existsSync(plist)) {
  console.log('patch-electron-dev: Electron.app not found, skipping')
  process.exit(0)
}

const pb = (cmd) => execSync(`/usr/libexec/PlistBuddy -c "${cmd}" "${plist}"`, { stdio: 'pipe' })

pb('Set :CFBundleName My Music Box')
pb('Set :CFBundleDisplayName My Music Box')
console.log('patch-electron-dev: patched CFBundleName and CFBundleDisplayName')

if (existsSync(iconSrc)) {
  copyFileSync(iconSrc, iconDst)
  console.log('patch-electron-dev: patched app icon')
}
