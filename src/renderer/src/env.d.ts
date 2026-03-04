/// <reference types="vite/client" />

// Types are duplicated here from the main/services so the renderer's
// TypeScript compiler (which targets the web) doesn't pull in Node.js types.

type CookiesBrowser = 'safari' | 'brave' | 'chrome' | 'chromium' | 'firefox' | 'none'

interface AppSettings {
  libraryPath: string | null
  bitrate: 192 | 256
  normalization: boolean
  normalizationLufs: number
  theme: 'light' | 'dark' | 'system'
  cookiesBrowser: CookiesBrowser
  crossfade: boolean
  crossfadeDuration: number
  searchResultCount: number
  quitOnClose: boolean
}

interface Track {
  id: number
  title: string
  artist: string | null
  original_query: string | null
  source_url: string | null
  duration: number | null
  bitrate: number | null
  file_size: number | null
  added_at: string
  normalized: number
  status: 'ok' | 'missing'
  hash: string | null
}

interface SyncResult {
  markedMissing: number
  restored: number
  totalTracks: number
}

interface SearchResult {
  id: string
  title: string
  uploader: string | null
  duration: number | null
  url: string
  webpage_url: string
  thumbnail: string | null
}

type JobStatus = 'downloading' | 'processing' | 'done' | 'error' | 'cancelled'

interface ImportFileInfo {
  path: string
  title: string
  artist: string | null
  duration: number | null
  size: number
}

interface DownloadProgressPayload {
  jobId: string
  progress: number
  status: JobStatus
}

interface DownloadCompletePayload {
  jobId: string
  track: Track
}

interface DownloadErrorPayload {
  jobId: string
  error: string
}

declare global {
  interface Window {
    api: {
      settings: {
        getAll: () => Promise<AppSettings>
        set: <K extends keyof AppSettings>(
          key: K,
          value: AppSettings[K]
        ) => Promise<AppSettings>
        selectLibraryPath: () => Promise<string | null>
        isLibraryValid: () => Promise<boolean>
        initLibrary: () => Promise<boolean>
      }
      library: {
        getTracks: (search?: string) => Promise<Track[]>
        deleteTrack: (id: number) => Promise<boolean>
        deleteTracks: (ids: number[]) => Promise<number>
        sync: () => Promise<SyncResult>
        readAudioFile: (id: number) => Promise<ArrayBuffer | null>
      }
      download: {
        checkDeps: () => Promise<{ ytdlp: boolean; ffmpeg: boolean }>
        search: (query: string) => Promise<SearchResult[]>
        start: (url: string, title: string, artist: string | null, duration: number | null) => Promise<string>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (payload: DownloadProgressPayload) => void) => () => void
        onComplete: (cb: (payload: DownloadCompletePayload) => void) => () => void
        onError: (cb: (payload: DownloadErrorPayload) => void) => () => void
      }
      player: {
        setMiniMode: (mini: boolean) => Promise<void>
        notifyLayoutChanged: (height: number) => Promise<void>
      }
      import: {
        selectFiles: () => Promise<ImportFileInfo[]>
        selectFolder: () => Promise<ImportFileInfo[]>
        start: (jobId: string, files: ImportFileInfo[]) => Promise<void>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (payload: { jobId: string; fileIndex: number; total: number; filename: string }) => void) => () => void
        onFileComplete: (cb: (payload: { jobId: string; fileIndex: number; track: Track }) => void) => () => void
        onFileError: (cb: (payload: { jobId: string; fileIndex: number; error: string }) => void) => () => void
        onDone: (cb: (payload: { jobId: string; imported: number; errors: number }) => void) => () => void
        checkDuplicates: (files: ImportFileInfo[]) => Promise<number[]>
      }
    }
  }
}
