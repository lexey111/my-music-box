import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '../main/services/SettingsService'
import type { Track, SyncResult } from '../main/services/LibraryService'
import type { SearchResult, JobStatus } from '../main/services/DownloadService'

// Re-export types so the renderer can import them via the env.d.ts declaration
export type { AppSettings, Track, SyncResult, SearchResult, JobStatus }

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
      ipcRenderer.invoke('library:sync')
  },

  app: {
    getMemoryMB: (): Promise<number> =>
      ipcRenderer.invoke('app:getMemoryMB')
  },

  download: {
    checkDeps: (): Promise<{ ytdlp: boolean; ffmpeg: boolean }> =>
      ipcRenderer.invoke('download:checkDeps'),

    search: (query: string): Promise<SearchResult[]> =>
      ipcRenderer.invoke('download:search', query),

    start: (url: string, title: string, artist: string | null): Promise<string> =>
      ipcRenderer.invoke('download:start', url, title, artist),

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
