#!/usr/bin/env node
/**
 * Downloads static ffmpeg + ffprobe binaries for macOS and places them in
 * resources/bin/ so they get bundled into the DMG via electron-builder.
 *
 * Run once before packaging: npm run download-ffmpeg
 *
 * Binaries come from https://www.osxexperts.net/ (macOS arm64 / x86_64).
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const arch = process.arch === 'arm64' ? 'arm' : 'intel'

const DOWNLOADS = [
  {
    name: 'ffmpeg',
    url: `https://www.osxexperts.net/ffmpeg80${arch}.zip`,
  },
  {
    name: 'ffprobe',
    url: `https://www.osxexperts.net/ffprobe80${arch}.zip`,
  },
]

const BIN_DIR = path.join(__dirname, '..', 'resources', 'bin')

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })

for (const { name, url } of DOWNLOADS) {
  const outBin = path.join(BIN_DIR, name)
  if (fs.existsSync(outBin)) {
    console.log(`  ${name} already exists, skipping.`)
    continue
  }

  const zipPath = path.join(BIN_DIR, `${name}.zip`)
  console.log(`Downloading ${name} from ${url} …`)
  execSync(`curl -L -o "${zipPath}" "${url}"`, { stdio: 'inherit' })

  console.log(`Extracting ${name} …`)
  execSync(`unzip -o "${zipPath}" -d "${BIN_DIR}"`)
  fs.unlinkSync(zipPath)
  // Remove macOS resource fork artifact from zip
  fs.rmSync(path.join(BIN_DIR, '__MACOSX'), { recursive: true, force: true })

  fs.chmodSync(outBin, 0o755)

  // Remove quarantine and ad-hoc codesign (required for arm64 on macOS)
  execSync(`xattr -dr com.apple.quarantine "${outBin}" 2>/dev/null || true`)
  execSync(`codesign --force --sign - "${outBin}"`)

  console.log(`  → ${outBin}`)
}

console.log('Done. ffmpeg/ffprobe are ready in resources/bin/')
