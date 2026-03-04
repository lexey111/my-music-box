import { writable, derived, get } from 'svelte/store'
import { notifyTracksDeleted } from './player'

// ── Core state ────────────────────────────────────────────────────────────────

// ── Import tab state (persisted across tab switches) ──────────────────────────

export const importFiles = writable<ImportFileInfo[]>([])
export const importSelected = writable<Set<number>>(new Set())
export const importDuplicates = writable<Set<number>>(new Set())

// ── Core state ────────────────────────────────────────────────────────────────

export const settings = writable<AppSettings>({
  libraryPath: null,
  bitrate: 256,
  normalization: true,
  normalizationLufs: -14,
  theme: 'system'
})

export const tracks = writable<Track[]>([])
export const search = writable('')
export const loading = writable(false)
export const importScanning = writable(false)
export const libraryValid = writable<boolean>(true)

export type ImportJobItemStatus = 'queued' | 'processing' | 'done' | 'error'

export interface ImportJobItem {
  filename: string
  status: ImportJobItemStatus
}

export interface ImportJobState {
  jobId: string
  current: number
  total: number
  filename: string
  items: ImportJobItem[]
}

export const activeImportJob = writable<ImportJobState | null>(null)
export const importJobResult = writable<{ imported: number; errors: number } | null>(null)
export const selectedIds = writable<Set<number>>(new Set())
export const activeTab = writable<'library' | 'addMusic' | 'importMusic' | 'settings'>('library')

export const libraryPath = derived(settings, ($s) => $s.libraryPath)

// ── Actions ───────────────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  const s = await window.api.settings.getAll()
  settings.set(s)

  if (s.libraryPath) {
    const valid = await window.api.settings.isLibraryValid()
    libraryValid.set(valid)
    if (valid) await loadTracks()
  }
}

export async function loadTracks(query?: string): Promise<void> {
  loading.set(true)
  try {
    const q = query ?? get(search)
    const result = await window.api.library.getTracks(q || undefined)
    tracks.set(result)

    const files = get(importFiles)
    if (files.length > 0) {
      const dupIndices = await window.api.import.checkDuplicates(files)
      importDuplicates.set(new Set(dupIndices))
    }
  } finally {
    loading.set(false)
  }
}

export async function initLibrary(): Promise<void> {
  const ok = await window.api.settings.initLibrary()
  libraryValid.set(ok)
  if (ok) await loadTracks()
}

export async function selectLibraryPath(): Promise<void> {
  const path = await window.api.settings.selectLibraryPath()
  if (!path) return

  settings.update((s) => ({ ...s, libraryPath: path }))
  const valid = await window.api.settings.isLibraryValid()
  libraryValid.set(valid)
  if (valid) await loadTracks()
}

export async function deleteTracks(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  notifyTracksDeleted(ids)
  await window.api.library.deleteTracks(ids)
  selectedIds.set(new Set())
  await loadTracks()
}

export async function sync(): Promise<SyncResult> {
  const result = await window.api.library.sync()
  await loadTracks()
  return result
}

export function toggleSelect(id: number): void {
  selectedIds.update((set) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

export function clearSelection(): void {
  selectedIds.set(new Set())
}

export function selectMissing(): void {
  const missing = get(tracks).filter(t => t.status === 'missing').map(t => t.id)
  selectedIds.set(new Set(missing))
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  const updated = await window.api.settings.set(key, value)
  settings.set(updated)
}
