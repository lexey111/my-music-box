import { ipcMain, dialog, app, nativeTheme } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { LibraryService } from '../services/LibraryService'
import { SettingsService } from '../services/SettingsService'
import { DownloadService } from '../services/DownloadService'
import { ImportService } from '../services/ImportService'

interface Deps {
  settings: SettingsService
  getLibrary: () => LibraryService | null
  setLibrary: (s: LibraryService | null) => void
  downloadService: DownloadService
  importService: ImportService
}

export function registerIpcHandlers({ settings, getLibrary, setLibrary, downloadService, importService }: Deps): void {
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
    if (getLibrary()) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Change Folder', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Change Library Folder',
        message: 'Change music library folder?',
        detail: 'The current library will be disconnected. Your files and database will remain in the old folder — nothing will be deleted.'
      })
      if (response === 1) return null
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select or create your Music Library folder'
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const libraryPath = result.filePaths[0]

    const old = getLibrary()
    if (old) old.close()
    setLibrary(null)

    settings.set('libraryPath', libraryPath)

    // If the folder already has library data, open it immediately.
    // If not, the renderer will show the permission screen.
    const hasDb = existsSync(join(libraryPath, 'library.db'))
    const hasTracksDir = existsSync(join(libraryPath, 'tracks'))
    if (hasDb || hasTracksDir) {
      try {
        setLibrary(new LibraryService(libraryPath))
      } catch (e) {
        console.error('[library] Failed to open library:', e)
      }
    }

    return libraryPath
  })

  ipcMain.handle('settings:initLibrary', () => {
    const path = settings.get('libraryPath')
    if (!path) return false
    try {
      const lib = new LibraryService(path)
      setLibrary(lib)
      return true
    } catch (e) {
      console.error('[library] initLibrary failed:', e)
      return false
    }
  })

  ipcMain.handle('settings:isLibraryValid', () => getLibrary() !== null)


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
    const track = library.getTrack(id)
    if (!track) { console.error(`[readAudioFile] track not found id=${id}`); return null }
    const filePath = library.filePath(id, track.filename)
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

  // ── Import ────────────────────────────────────────────────────────────────

  ipcMain.handle('import:selectFiles', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'wma', 'aiff', 'aif'] }]
    })
    if (result.canceled) return []
    return importService.scanFiles(result.filePaths, undefined, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:scanProgress', { done, total })
    })
  })

  ipcMain.handle('import:selectFolder', async (event) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return []
    return importService.scanFolder(result.filePaths[0], undefined, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:scanProgress', { done, total })
    })
  })

  ipcMain.handle('import:scanFiles', (event, paths: string[]) => {
    return importService.scanFiles(paths, undefined, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:scanProgress', { done, total })
    })
  })

  ipcMain.handle('import:scanPaths', (event, paths: string[]) => {
    return importService.scanPaths(paths, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:scanProgress', { done, total })
    })
  })

  ipcMain.handle('import:start', (event, jobId: string, files: unknown[]) => {
    const library = getLibrary()
    if (!library) throw new Error('No library selected')
    const s = settings.getAll()
    importService.startImport(
      jobId,
      files as Parameters<ImportService['startImport']>[1],
      { bitrate: s.bitrate, normalization: s.normalization, normalizationLufs: s.normalizationLufs },
      library,
      (p) => { if (!event.sender.isDestroyed()) event.sender.send('import:progress', p) },
      (p) => { if (!event.sender.isDestroyed()) event.sender.send('import:fileComplete', p) },
      (p) => { if (!event.sender.isDestroyed()) event.sender.send('import:fileError', p) },
      (p) => { if (!event.sender.isDestroyed()) event.sender.send('import:done', p) }
    )
  })

  ipcMain.handle('import:cancel', (_, jobId: string) => importService.cancelImport(jobId))

  ipcMain.handle('import:checkDuplicates', (_, files: import('../services/ImportService').ImportFileInfo[]) => {
    const library = getLibrary()
    if (!library) return []
    return importService.checkLibraryDuplicates(files, library)
  })
}
