import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '../main/services/SettingsService'
import type { Track, SyncResult } from '../main/services/LibraryService'
import type { SearchResult, JobStatus } from '../main/services/DownloadService'
import type { ImportFileInfo } from '../main/services/ImportService'

// Re-export types so the renderer can import them via the env.d.ts declaration
export type { AppSettings, Track, SyncResult, SearchResult, JobStatus, ImportFileInfo }

const api = {
  settings: {
    getAll: (): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:getAll'),

    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:set', key, value),

    selectLibraryPath: (): Promise<string | null> =>
      ipcRenderer.invoke('settings:selectLibraryPath')
  },

  library: {
    getTracks: (search?: string): Promise<Track[]> =>
      ipcRenderer.invoke('library:getTracks', search),

    deleteTrack: (id: number): Promise<boolean> =>
      ipcRenderer.invoke('library:deleteTrack', id),

    deleteTracks: (ids: number[]): Promise<number> =>
      ipcRenderer.invoke('library:deleteTracks', ids),

    sync: (): Promise<SyncResult> =>
      ipcRenderer.invoke('library:sync'),

    readAudioFile: (id: number): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('library:readAudioFile', id)
  },

  app: {
    getMemoryMB: (): Promise<number> =>
      ipcRenderer.invoke('app:getMemoryMB')
  },

  player: {
    setMiniMode: (mini: boolean): Promise<void> =>
      ipcRenderer.invoke('player:setMiniMode', mini),
    notifyLayoutChanged: (height: number): Promise<void> =>
      ipcRenderer.invoke('player:notifyLayoutChanged', height)
  },

  download: {
    checkDeps: (): Promise<{ ytdlp: boolean; ffmpeg: boolean }> =>
      ipcRenderer.invoke('download:checkDeps'),

    search: (query: string): Promise<SearchResult[]> =>
      ipcRenderer.invoke('download:search', query),

    start: (url: string, title: string, artist: string | null, duration: number | null): Promise<string> =>
      ipcRenderer.invoke('download:start', url, title, artist, duration),

    cancel: (jobId: string): Promise<void> =>
      ipcRenderer.invoke('download:cancel', jobId),

    onProgress: (cb: (payload: { jobId: string; progress: number; status: JobStatus }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; progress: number; status: JobStatus }): void => cb(payload)
      ipcRenderer.on('download:progress', listener)
      return () => ipcRenderer.off('download:progress', listener)
    },

    onComplete: (cb: (payload: { jobId: string; track: Track }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; track: Track }): void => cb(payload)
      ipcRenderer.on('download:complete', listener)
      return () => ipcRenderer.off('download:complete', listener)
    },

    onError: (cb: (payload: { jobId: string; error: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; error: string }): void => cb(payload)
      ipcRenderer.on('download:error', listener)
      return () => ipcRenderer.off('download:error', listener)
    }
  },

  import: {
    selectFiles: (): Promise<ImportFileInfo[]> =>
      ipcRenderer.invoke('import:selectFiles'),

    selectFolder: (): Promise<ImportFileInfo[]> =>
      ipcRenderer.invoke('import:selectFolder'),

    scanFiles: (paths: string[]): Promise<ImportFileInfo[]> =>
      ipcRenderer.invoke('import:scanFiles', paths),

    scanPaths: (paths: string[]): Promise<ImportFileInfo[]> =>
      ipcRenderer.invoke('import:scanPaths', paths),

    getPathForFile: (file: File): string => webUtils.getPathForFile(file),

    onScanProgress: (cb: (payload: { done: number; total: number }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { done: number; total: number }): void => cb(payload)
      ipcRenderer.on('import:scanProgress', listener)
      return () => ipcRenderer.off('import:scanProgress', listener)
    },

    start: (jobId: string, files: ImportFileInfo[]): Promise<void> =>
      ipcRenderer.invoke('import:start', jobId, files),

    cancel: (jobId: string): Promise<void> =>
      ipcRenderer.invoke('import:cancel', jobId),

    onProgress: (cb: (payload: { jobId: string; fileIndex: number; total: number; filename: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; fileIndex: number; total: number; filename: string }): void => cb(payload)
      ipcRenderer.on('import:progress', listener)
      return () => ipcRenderer.off('import:progress', listener)
    },

    onFileComplete: (cb: (payload: { jobId: string; fileIndex: number; track: Track }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; fileIndex: number; track: Track }): void => cb(payload)
      ipcRenderer.on('import:fileComplete', listener)
      return () => ipcRenderer.off('import:fileComplete', listener)
    },

    onFileError: (cb: (payload: { jobId: string; fileIndex: number; error: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; fileIndex: number; error: string }): void => cb(payload)
      ipcRenderer.on('import:fileError', listener)
      return () => ipcRenderer.off('import:fileError', listener)
    },

    onDone: (cb: (payload: { jobId: string; imported: number; errors: number }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: { jobId: string; imported: number; errors: number }): void => cb(payload)
      ipcRenderer.on('import:done', listener)
      return () => ipcRenderer.off('import:done', listener)
    },

    checkDuplicates: (files: ImportFileInfo[]): Promise<number[]> =>
      ipcRenderer.invoke('import:checkDuplicates', files)
  }
}

export type API = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore – fallback for non-isolated contexts (shouldn't happen)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
