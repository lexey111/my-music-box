import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { LibraryService } from './LibraryService'
import type { AppSettings } from './SettingsService'

export interface SearchResult {
  id: string
  title: string
  uploader: string | null
  duration: number | null
  url: string
  webpage_url: string
  thumbnail: string | null
}

export type JobStatus = 'downloading' | 'processing' | 'done' | 'error' | 'cancelled'

export interface DownloadJob {
  jobId: string
  title: string
  status: JobStatus
  progress: number // 0–100
  error?: string
}

interface ActiveJob {
  process: ChildProcess | null
  cancelled: boolean
}

const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin']

// Browsers checked in preference order; Safari is always present on macOS.
const BROWSER_APPS: Array<{ name: string; app: string }> = [
  { name: 'chrome',   app: '/Applications/Google Chrome.app' },
  { name: 'brave',    app: '/Applications/Brave Browser.app' },
  { name: 'chromium', app: '/Applications/Chromium.app' },
  { name: 'firefox',  app: '/Applications/Firefox.app' },
  { name: 'safari',   app: '/Applications/Safari.app' }
]

function findBrowserForCookies(): string | null {
  for (const { name, app } of BROWSER_APPS) {
    if (existsSync(app)) return name
  }
  return null
}

function humanizeError(raw: string): string {
  // macOS Full Disk Access not granted for Safari/browser cookies
  if (raw.includes('Operation not permitted') && raw.includes('Cookies')) {
    const browser = raw.includes('Safari') ? 'Safari' : 'your browser'
    return (
      `${browser} cookies are protected by macOS. ` +
      `Grant Full Disk Access: System Settings → Privacy & Security → Full Disk Access → add this app. ` +
      `Or switch to Brave in the Cookies picker (it works without extra permissions).`
    )
  }
  // YouTube bot / sign-in wall
  if (raw.includes('Sign in to confirm') || raw.includes('bot')) {
    return (
      `YouTube requires you to be signed in. ` +
      `Make sure you are logged into YouTube in the browser selected in the Cookies picker, ` +
      `then try again.`
    )
  }
  // Video unavailable / private / region-locked
  if (raw.includes('Video unavailable') || raw.includes('Private video')) {
    return `This video is unavailable or private.`
  }
  if (raw.includes('not available in your country')) {
    return `This video is not available in your region.`
  }
  return raw
}

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

export class DownloadService {
  private activeJobs = new Map<string, ActiveJob>()

  async checkDependencies(): Promise<{ ytdlp: boolean; ffmpeg: boolean }> {
    return {
      ytdlp: findBinary('yt-dlp') !== null,
      ffmpeg: findBinary('ffmpeg') !== null
    }
  }

  async search(query: string, cookiesBrowser: string, count: number): Promise<SearchResult[]> {
    const ytdlp = findBinary('yt-dlp')
    if (!ytdlp) throw new Error('yt-dlp not found')

    return new Promise((resolve, reject) => {
      const args = [
        `ytsearch${count}:${query}`,
        '--dump-json',
        '--flat-playlist',
        '--no-warnings',
        ...(cookiesBrowser !== 'none' ? ['--cookies-from-browser', cookiesBrowser] : [])
      ]
      const proc = spawn(ytdlp, args)
      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', (code) => {
        if (code !== 0 && stdout.trim() === '') {
          const raw = stderr.split('\n').find((l) => l.trimStart().startsWith('ERROR:'))?.trim()
            ?? stderr.trim().split('\n').filter((l) => l.trim()).pop()
            ?? `yt-dlp exited with code ${code}`
          return reject(new Error(humanizeError(raw)))
        }
        const results: SearchResult[] = []
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const obj = JSON.parse(trimmed)
            const videoId: string = obj.id ?? ''
            const ytUrl = (u: unknown): string =>
              typeof u === 'string' && u.startsWith('http') ? u : ''
            const fallback = videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
            results.push({
              id: videoId,
              title: obj.title ?? 'Unknown',
              uploader: obj.uploader ?? obj.channel ?? null,
              duration: typeof obj.duration === 'number' ? obj.duration : null,
              url: ytUrl(obj.url) || ytUrl(obj.webpage_url) || fallback,
              webpage_url: ytUrl(obj.webpage_url) || ytUrl(obj.url) || fallback,
              thumbnail: obj.thumbnail ?? null
            })
          } catch {
            // skip malformed lines
          }
        }
        resolve(results.slice(0, count))
      })

      proc.on('error', reject)
    })
  }

  startDownload(
    jobId: string,
    url: string,
    title: string,
    artist: string | null,
    duration: number | null,
    settings: Pick<AppSettings, 'bitrate' | 'normalization' | 'normalizationLufs' | 'cookiesBrowser'>,
    libraryService: LibraryService,
    sendProgress: (payload: { jobId: string; progress: number; status: JobStatus }) => void,
    sendComplete: (payload: { jobId: string; track: unknown }) => void,
    sendError: (payload: { jobId: string; error: string }) => void
  ): void {
    const job: ActiveJob = { process: null, cancelled: false }
    this.activeJobs.set(jobId, job)

    const tmpDir = join(libraryService.tracksDir, '.tmp')
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    const tmpBase = join(tmpDir, jobId)

    this.runDownload(jobId, url, title, artist, duration, settings, libraryService, tmpBase, job, sendProgress, sendComplete, sendError)
  }

  private async runDownload(
    jobId: string,
    url: string,
    title: string,
    artist: string | null,
    duration: number | null,
    settings: Pick<AppSettings, 'bitrate' | 'normalization' | 'normalizationLufs' | 'cookiesBrowser'>,
    libraryService: LibraryService,
    tmpBase: string,
    job: ActiveJob,
    sendProgress: (payload: { jobId: string; progress: number; status: JobStatus }) => void,
    sendComplete: (payload: { jobId: string; track: unknown }) => void,
    sendError: (payload: { jobId: string; error: string }) => void
  ): Promise<void> {
    const rawMp3 = `${tmpBase}.mp3`
    const normMp3 = `${tmpBase}_norm.mp3`
    const tmpFiles = [rawMp3, normMp3]

    const cleanup = (): void => {
      for (const f of tmpFiles) {
        try { if (existsSync(f)) unlinkSync(f) } catch { /* ignore */ }
      }
      this.activeJobs.delete(jobId)
    }

    try {
      // ── Phase 1: yt-dlp download (0–90%) ──────────────────────────────────
      const ytdlp = findBinary('yt-dlp')!
      const cb = settings.cookiesBrowser
      const ytArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--no-playlist',
        '--newline',
        ...(cb !== 'none' ? ['--cookies-from-browser', cb] : []),
        '-o', `${tmpBase}.%(ext)s`,
        url
      ]

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ytdlp, ytArgs)
        job.process = proc
        let stderrBuf = ''

        const parseProgress = (line: string): void => {
          const match = line.match(/\[download\]\s+([\d.]+)%/)
          if (match) {
            const pct = Math.round(parseFloat(match[1]) * 0.9) // scale to 0–90
            sendProgress({ jobId, progress: pct, status: 'downloading' })
          }
        }

        proc.stderr.on('data', (d: Buffer) => {
          const chunk = d.toString()
          stderrBuf += chunk
          parseProgress(chunk)
        })

        proc.stdout.on('data', (d: Buffer) => parseProgress(d.toString()))

        proc.on('close', (code) => {
          job.process = null
          if (job.cancelled) return reject(new Error('cancelled'))
          if (code !== 0) {
            const errorLine =
              stderrBuf.split('\n').find((l) => l.trimStart().startsWith('ERROR:'))?.trim() ??
              stderrBuf.trim().split('\n').filter((l) => l.trim()).pop() ??
              `yt-dlp exited with code ${code}`
            return reject(new Error(humanizeError(errorLine)))
          }
          resolve()
        })
        proc.on('error', (err) => {
          job.process = null
          reject(err)
        })
      })

      if (job.cancelled) { cleanup(); return }

      // ── Phase 2: ffmpeg encode / normalize (90–99%) ────────────────────────
      sendProgress({ jobId, progress: 90, status: 'processing' })

      const ffmpeg = findBinary('ffmpeg')!
      let finalTmp = rawMp3

      if (settings.normalization) {
        const lufs = settings.normalizationLufs ?? -14
        const ffArgs = [
          '-y', '-i', rawMp3,
          '-af', `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
          '-b:a', `${settings.bitrate}k`,
          '-map_metadata', '-1',
          normMp3
        ]
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpeg, ffArgs)
          job.process = proc
          proc.on('close', (code) => {
            job.process = null
            if (job.cancelled) return reject(new Error('cancelled'))
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`))
            resolve()
          })
          proc.on('error', (err) => { job.process = null; reject(err) })
        })
        finalTmp = normMp3
      } else {
        // Re-encode to ensure correct bitrate and strip metadata
        const normOut = `${tmpBase}_enc.mp3`
        tmpFiles.push(normOut)
        const ffArgs = [
          '-y', '-i', rawMp3,
          '-b:a', `${settings.bitrate}k`,
          '-map_metadata', '-1',
          normOut
        ]
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpeg, ffArgs)
          job.process = proc
          proc.on('close', (code) => {
            job.process = null
            if (job.cancelled) return reject(new Error('cancelled'))
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`))
            resolve()
          })
          proc.on('error', (err) => { job.process = null; reject(err) })
        })
        finalTmp = normOut
      }

      if (job.cancelled) { cleanup(); return }

      sendProgress({ jobId, progress: 99, status: 'processing' })

      // ── Phase 3: insert into library ───────────────────────────────────────
      const track = libraryService.insertTrack(
        {
          title,
          artist,
          original_query: null,
          source_url: url,
          duration,
          bitrate: settings.bitrate,
          normalized: settings.normalization ? 1 : 0
        },
        finalTmp
      )

      // finalTmp has been moved by insertTrack; remove rawMp3 if separate
      for (const f of tmpFiles) {
        if (f !== finalTmp) {
          try { if (existsSync(f)) unlinkSync(f) } catch { /* ignore */ }
        }
      }
      this.activeJobs.delete(jobId)

      sendComplete({ jobId, track })
    } catch (err) {
      cleanup()
      if ((err as Error).message === 'cancelled') return
      sendError({ jobId, error: (err as Error).message })
    }
  }

  cancelDownload(jobId: string): void {
    const job = this.activeJobs.get(jobId)
    if (!job) return
    job.cancelled = true
    job.process?.kill('SIGTERM')
  }
}
