import { writable, derived, get } from 'svelte/store'

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
export const selectedIds = writable<Set<number>>(new Set())

export const libraryPath = derived(settings, ($s) => $s.libraryPath)

// ── Actions ───────────────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  const s = await window.api.settings.getAll()
  settings.set(s)

  if (s.libraryPath) {
    await loadTracks()
  }
}

export async function loadTracks(query?: string): Promise<void> {
  loading.set(true)
  try {
    const q = query ?? get(search)
    const result = await window.api.library.getTracks(q || undefined)
    tracks.set(result)
  } finally {
    loading.set(false)
  }
}

export async function selectLibraryPath(): Promise<void> {
  const path = await window.api.settings.selectLibraryPath()
  if (!path) return

  settings.update((s) => ({ ...s, libraryPath: path }))
  await loadTracks()
}

export async function deleteTracks(ids: number[]): Promise<void> {
  if (ids.length === 0) return
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

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  const updated = await window.api.settings.set(key, value)
  settings.set(updated)
}
