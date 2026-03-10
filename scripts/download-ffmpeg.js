#!/usr/bin/env node
/**
 * Downloads static ffmpeg + ffprobe binaries for macOS and places them in
 * resources/bin/ so they get bundled into the DMG via electron-builder.
 *
 * Run once before packaging: npm run download-ffmpeg
 *
 * Binaries come from https://evermeet.cx/ffmpeg/ (macOS arm64 / x86_64).
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const ARCH_SUFFIX = arch === 'arm64' ? '' : '-x86_64'   // evermeet uses no suffix for arm64

// evermeet.cx provides the latest stable release as a zip
const DOWNLOADS = [
  {
    name: 'ffmpeg',
    url: `https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip`,
  },
  {
    name: 'ffprobe',
    url: `https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip`,
  },
]

const BIN_DIR = path.join(__dirname, '..', 'resources', 'bin')

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
      }).on('error', reject)
    }
    follow(url)
  })
}

;(async () => {
  for (const { name, url } of DOWNLOADS) {
    const outBin = path.join(BIN_DIR, name)
    if (fs.existsSync(outBin)) {
      console.log(`  ${name} already exists, skipping.`)
      continue
    }

    const zipPath = path.join(BIN_DIR, `${name}.zip`)
    console.log(`Downloading ${name} from ${url} …`)
    await download(url, zipPath)

    console.log(`Extracting ${name} …`)
    execSync(`unzip -o "${zipPath}" -d "${BIN_DIR}"`)
    fs.unlinkSync(zipPath)

    // The zip contains just the binary named 'ffmpeg' or 'ffprobe'
    fs.chmodSync(outBin, 0o755)
    console.log(`  → ${outBin}`)
  }

  console.log('Done. ffmpeg/ffprobe are ready in resources/bin/')
})().catch((err) => {
  console.error('Failed to download ffmpeg:', err.message)
  process.exit(1)
})
