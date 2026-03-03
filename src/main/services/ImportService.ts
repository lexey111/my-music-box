import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import type { LibraryService } from './LibraryService'
import type { AppSettings } from './SettingsService'

export interface ImportFileInfo {
  path: string
  title: string
  artist: string | null
  duration: number | null
  size: number
}

export type ImportJobStatus = 'processing' | 'done' | 'error' | 'cancelled'

interface ActiveImport {
  process: ChildProcess | null
  cancelled: boolean
}

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma', '.aiff', '.aif'
])

const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin']

function findBinary(name: string): string | null {
  try {
    const result = execSync(`which ${name}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return result.trim() || null
  } catch {
    // fall through to manual check
  }
  for (const dir of EXTRA_PATHS) {
    const full = join(dir, name)
    if (existsSync(full)) return full
  }
  return null
}

function parseFilename(filePath: string): { title: string; artist: string | null } {
  const name = basename(filePath, extname(filePath))
  const dashIdx = name.indexOf(' - ')
  if (dashIdx > 0) {
    return {
      artist: name.slice(0, dashIdx).trim(),
      title: name.slice(dashIdx + 3).trim()
    }
  }
  return { title: name, artist: null }
}

async function probeFile(filePath: string): Promise<ImportFileInfo> {
  const ffprobe = findBinary('ffprobe')
  const size = statSync(filePath).size

  if (!ffprobe) {
    const fallback = parseFilename(filePath)
    return { path: filePath, ...fallback, duration: null, size }
  }

  return new Promise((resolve) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath]
    const proc = spawn(ffprobe, args)
    let stdout = ''

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        const fallback = parseFilename(filePath)
        resolve({ path: filePath, ...fallback, duration: null, size })
        return
      }
      try {
        const json = JSON.parse(stdout)
        const tags = json.format?.tags ?? {}
        const rawTitle: string | undefined = tags.title ?? tags.TITLE
        const rawArtist: string | undefined = tags.artist ?? tags.ARTIST
        const rawDuration: string | undefined = json.format?.duration
        const duration = rawDuration ? Math.round(parseFloat(rawDuration)) : null

        if (rawTitle) {
          resolve({
            path: filePath,
            title: rawTitle,
            artist: rawArtist ?? null,
            duration,
            size
          })
        } else {
          const fallback = parseFilename(filePath)
          resolve({ path: filePath, ...fallback, duration, size })
        }
      } catch {
        const fallback = parseFilename(filePath)
        resolve({ path: filePath, ...fallback, duration: null, size })
      }
    })
    proc.on('error', () => {
      const fallback = parseFilename(filePath)
      resolve({ path: filePath, ...fallback, duration: null, size })
    })
  })
}

async function runInParallel<T>(
  items: T[],
  fn: (item: T) => Promise<T extends string ? ImportFileInfo : never>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void
): Promise<ImportFileInfo[]> {
  const results: ImportFileInfo[] = []
  let index = 0
  let done = 0
  const total = items.length

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await (fn as (item: T) => Promise<ImportFileInfo>)(items[i])
      done++
      onProgress?.(done, total)
    }
  }

  const workers = Array.from({ length: concurrency }, worker)
  await Promise.all(workers)
  return results
}

export class ImportService {
  private activeImports = new Map<string, ActiveImport>()

  async scanFiles(paths: string[], existingPaths?: Set<string>, onProgress?: (done: number, total: number) => void): Promise<ImportFileInfo[]> {
    const filtered = existingPaths ? paths.filter(p => !existingPaths.has(p)) : paths
    return runInParallel(filtered, probeFile as (item: string) => Promise<ImportFileInfo>, 4, onProgress)
  }

  async scanFolder(folderPath: string, existingPaths?: Set<string>, onProgress?: (done: number, total: number) => void): Promise<ImportFileInfo[]> {
    const entries = readdirSync(folderPath, { recursive: true, encoding: 'utf-8' }) as string[]
    const audioPaths = entries
      .map((rel) => join(folderPath, rel))
      .filter((p) => {
        try {
          return statSync(p).isFile() && AUDIO_EXTENSIONS.has(extname(p).toLowerCase())
        } catch {
          return false
        }
      })
    return this.scanFiles(audioPaths, existingPaths, onProgress)
  }

  async scanPaths(paths: string[], onProgress?: (done: number, total: number) => void): Promise<ImportFileInfo[]> {
    const filePaths: string[] = []
    for (const p of paths) {
      try {
        if (statSync(p).isDirectory()) {
          const entries = readdirSync(p, { recursive: true, encoding: 'utf-8' }) as string[]
          for (const rel of entries) {
            const full = join(p, rel)
            try {
              if (statSync(full).isFile() && AUDIO_EXTENSIONS.has(extname(full).toLowerCase()))
                filePaths.push(full)
            } catch { /* ignore */ }
          }
        } else if (AUDIO_EXTENSIONS.has(extname(p).toLowerCase())) {
          filePaths.push(p)
        }
      } catch { /* ignore */ }
    }
    return this.scanFiles(filePaths, undefined, onProgress)
  }

  checkLibraryDuplicates(files: ImportFileInfo[], library: LibraryService): number[] {
    return files
      .map((f, i) => library.findByMeta(f.title, f.artist, f.duration) ? i : -1)
      .filter(i => i !== -1)
  }

  startImport(
    jobId: string,
    files: ImportFileInfo[],
    settings: Pick<AppSettings, 'bitrate' | 'normalization' | 'normalizationLufs'>,
    libraryService: LibraryService,
    sendProgress: (payload: { jobId: string; fileIndex: number; total: number; filename: string }) => void,
    sendFileComplete: (payload: { jobId: string; fileIndex: number; track: unknown }) => void,
    sendFileError: (payload: { jobId: string; fileIndex: number; error: string }) => void,
    sendDone: (payload: { jobId: string; imported: number; errors: number }) => void
  ): void {
    const job: ActiveImport = { process: null, cancelled: false }
    this.activeImports.set(jobId, job)
    this.runImport(jobId, files, settings, libraryService, job, sendProgress, sendFileComplete, sendFileError, sendDone)
  }

  private async runImport(
    jobId: string,
    files: ImportFileInfo[],
    settings: Pick<AppSettings, 'bitrate' | 'normalization' | 'normalizationLufs'>,
    libraryService: LibraryService,
    job: ActiveImport,
    sendProgress: (payload: { jobId: string; fileIndex: number; total: number; filename: string }) => void,
    sendFileComplete: (payload: { jobId: string; fileIndex: number; track: unknown }) => void,
    sendFileError: (payload: { jobId: string; fileIndex: number; error: string }) => void,
    sendDone: (payload: { jobId: string; imported: number; errors: number }) => void
  ): Promise<void> {
    const ffmpeg = findBinary('ffmpeg')
    const tmpDir = join(libraryService.tracksDir, '.tmp')
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    let imported = 0
    let errors = 0

    for (let i = 0; i < files.length; i++) {
      if (job.cancelled) break

      const file = files[i]
      const filename = basename(file.path)
      sendProgress({ jobId, fileIndex: i, total: files.length, filename })

      const tmpFile = join(tmpDir, `import_${jobId}_${i}.mp3`)

      try {
        if (!ffmpeg) throw new Error('ffmpeg not found')

        const lufs = settings.normalizationLufs ?? -14
        const ffArgs = settings.normalization
          ? ['-y', '-i', file.path, '-af', `loudnorm=I=${lufs}:LRA=11:TP=-1.5`, '-b:a', `${settings.bitrate}k`, '-map_metadata', '-1', tmpFile]
          : ['-y', '-i', file.path, '-b:a', `${settings.bitrate}k`, '-map_metadata', '-1', tmpFile]

        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpeg, ffArgs)
          job.process = proc
          let stderr = ''
          proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
          proc.on('close', (code) => {
            job.process = null
            if (job.cancelled) return reject(new Error('cancelled'))
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-200)}`))
            resolve()
          })
          proc.on('error', (err) => { job.process = null; reject(err) })
        })

        if (job.cancelled) {
          try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch { /* ignore */ }
          break
        }

        const track = libraryService.insertTrack(
          {
            title: file.title,
            artist: file.artist,
            original_query: null,
            source_url: null,
            duration: file.duration,
            bitrate: settings.bitrate,
            normalized: settings.normalization ? 1 : 0
          },
          tmpFile
        )

        sendFileComplete({ jobId, fileIndex: i, track })
        imported++
      } catch (err) {
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch { /* ignore */ }
        if ((err as Error).message === 'cancelled') break
        sendFileError({ jobId, fileIndex: i, error: (err as Error).message })
        errors++
      }
    }

    this.activeImports.delete(jobId)
    sendDone({ jobId, imported, errors })
  }

  cancelImport(jobId: string): void {
    const job = this.activeImports.get(jobId)
    if (!job) return
    job.cancelled = true
    job.process?.kill('SIGTERM')
  }
}
