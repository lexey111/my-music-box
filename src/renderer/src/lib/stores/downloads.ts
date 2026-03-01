import { writable } from 'svelte/store'

export interface ClientJob {
  jobId: string
  url: string
  title: string
  artist: string | null
  progress: number
  status: JobStatus
  error?: string
}

export const deps = writable<{ ytdlp: boolean; ffmpeg: boolean } | null>(null)
export const searchResults = writable<SearchResult[]>([])
export const searching = writable(false)
export const searchError = writable<string | null>(null)
export const activeJobs = writable<Map<string, ClientJob>>(new Map())
export const pendingQuery = writable<string>('')

export function redownloadTrack(track: Track): void {
  searchError.set(null)
  searching.set(false)
  const q = [track.title, track.artist].filter(Boolean).join(' ')
  pendingQuery.set(q)
  if (track.source_url) {
    searchResults.set([{
      id: track.source_url,
      title: track.title,
      uploader: track.artist,
      duration: track.duration,
      url: track.source_url,
      webpage_url: track.source_url,
      thumbnail: null
    }])
  } else {
    searchResults.set([])
  }
}

export async function checkDeps(): Promise<void> {
  const result = await window.api.download.checkDeps()
  deps.set(result)
}

export async function doSearch(query: string): Promise<void> {
  searching.set(true)
  searchError.set(null)
  searchResults.set([])
  try {
    const results = await window.api.download.search(query)
    searchResults.set(results)
  } catch (err) {
    searchError.set((err as Error).message ?? 'Search failed')
  } finally {
    searching.set(false)
  }
}

export async function startDownload(result: SearchResult): Promise<void> {
  const jobId = await window.api.download.start(
    result.webpage_url || result.url,
    result.title,
    result.uploader,
    result.duration
  )

  activeJobs.update((m) => {
    const next = new Map(m)
    next.set(jobId, {
      jobId,
      url: result.webpage_url || result.url,
      title: result.title,
      artist: result.uploader,
      progress: 0,
      status: 'downloading'
    })
    return next
  })
}

export function dismissJob(jobId: string): void {
  activeJobs.update((m) => {
    const next = new Map(m)
    next.delete(jobId)
    return next
  })
}

export function cancelDownload(jobId: string): void {
  window.api.download.cancel(jobId)
  activeJobs.update((m) => {
    const next = new Map(m)
    next.delete(jobId)
    return next
  })
}

export function handleProgress(payload: DownloadProgressPayload): void {
  activeJobs.update((m) => {
    const job = m.get(payload.jobId)
    if (!job) return m
    const next = new Map(m)
    next.set(payload.jobId, { ...job, progress: payload.progress, status: payload.status })
    return next
  })
}

export function handleComplete(payload: DownloadCompletePayload): void {
  activeJobs.update((m) => {
    const job = m.get(payload.jobId)
    if (!job) return m
    const next = new Map(m)
    next.set(payload.jobId, { ...job, progress: 100, status: 'done' })
    return next
  })

  setTimeout(() => {
    activeJobs.update((m) => {
      const next = new Map(m)
      next.delete(payload.jobId)
      return next
    })
  }, 3000)
}

export function handleError(payload: DownloadErrorPayload): void {
  activeJobs.update((m) => {
    const job = m.get(payload.jobId)
    if (!job) return m
    const next = new Map(m)
    next.set(payload.jobId, { ...job, status: 'error', error: payload.error })
    return next
  })
}
