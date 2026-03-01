import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export type CookiesBrowser = 'safari' | 'brave' | 'chrome' | 'chromium' | 'firefox' | 'none'

export interface AppSettings {
  libraryPath: string | null
  bitrate: 192 | 256
  normalization: boolean
  normalizationLufs: number
  theme: 'light' | 'dark' | 'system'
  cookiesBrowser: CookiesBrowser
}

const defaults: AppSettings = {
  libraryPath: null,
  bitrate: 256,
  normalization: true,
  normalizationLufs: -14,
  theme: 'system',
  cookiesBrowser: 'safari'
}

export class SettingsService {
  private filePath: string
  private settings: AppSettings

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'settings.json')
    this.settings = this.load()
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...defaults }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return { ...defaults, ...JSON.parse(raw) }
    } catch {
      return { ...defaults }
    }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  getAll(): AppSettings {
    return { ...this.settings }
  }
}
