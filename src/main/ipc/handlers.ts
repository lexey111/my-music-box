import { ipcMain, dialog, app, nativeTheme } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { LibraryService } from '../services/LibraryService'
import { SettingsService } from '../services/SettingsService'
import { DownloadService } from '../services/DownloadService'

interface Deps {
  settings: SettingsService
  getLibrary: () => LibraryService | null
  setLibrary: (s: LibraryService | null) => void
  downloadService: DownloadService
}

export function registerIpcHandlers({ settings, getLibrary, setLibrary, downloadService }: Deps): void {
  // ── Settings ─────────────────────────────────────────────────────────────

  ipcMain.handle('settings:getAll', () => settings.getAll())

  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    settings.set(key as never, value as never)
    if (key === 'theme') {
      nativeTheme.themeSource = value as 'system' | 'light' | 'dark'
    }
    return settings.getAll()
  })

  ipcMain.handle('settings:selectLibraryPath', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select or create your Music Library folder'
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const libraryPath = result.filePaths[0]

    const old = getLibrary()
    if (old) old.close()

    const library = new LibraryService(libraryPath)
    setLibrary(library)
    settings.set('libraryPath', libraryPath)

    return libraryPath
  })

  ipcMain.handle('app:getMemoryMB', () => {
    const total = app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0)
    return Math.round(total / 1024) // KB → MB
  })

  // ── Library ───────────────────────────────────────────────────────────────

  ipcMain.handle('library:getTracks', (_, search?: string) => {
    return getLibrary()?.getTracks(search) ?? []
  })

  ipcMain.handle('library:deleteTrack', (_, id: number) => {
    return getLibrary()?.deleteTrack(id) ?? false
  })

  ipcMain.handle('library:deleteTracks', (_, ids: number[]) => {
    return getLibrary()?.deleteTracks(ids) ?? 0
  })

  ipcMain.handle('library:sync', () => {
    return getLibrary()?.sync() ?? { markedMissing: 0, restored: 0, totalTracks: 0 }
  })

  ipcMain.handle('library:readAudioFile', (_, id: number): Buffer | null => {
    const library = getLibrary()
    if (!library) { console.error('[readAudioFile] no library'); return null }
    const filePath = library.filePath(id)
    try {
      const buf = readFileSync(filePath)
      console.log(`[readAudioFile] id=${id} path=${filePath} size=${buf.byteLength}`)
      return buf
    } catch (e) {
      console.error(`[readAudioFile] failed to read id=${id} path=${filePath}`, e)
      return null
    }
  })

  // ── Download ──────────────────────────────────────────────────────────────

  ipcMain.handle('download:checkDeps', () => downloadService.checkDependencies())

  ipcMain.handle('download:search', (_, query: string) =>
    downloadService.search(query, settings.get('cookiesBrowser'), settings.get('searchResultCount'))
  )

  ipcMain.handle('download:start', (event, url: string, title: string, artist: string | null, duration: number | null) => {
    const library = getLibrary()
    if (!library) throw new Error('No library selected')

    const jobId = randomUUID()
    const s = settings.getAll()

    downloadService.startDownload(
      jobId,
      url,
      title,
      artist,
      duration,
      { bitrate: s.bitrate, normalization: s.normalization, normalizationLufs: s.normalizationLufs, cookiesBrowser: s.cookiesBrowser },
      library,
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send('download:progress', payload)
      },
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send('download:complete', payload)
      },
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send('download:error', payload)
      }
    )

    return jobId
  })

  ipcMain.handle('download:cancel', (_, jobId: string) => downloadService.cancelDownload(jobId))
}
