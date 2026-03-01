import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { LibraryService } from './services/LibraryService'
import { SettingsService } from './services/SettingsService'
import { DownloadService } from './services/DownloadService'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let library: LibraryService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset', // native macOS traffic lights
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  // Open external links in the system browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.musicbox.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const settings = new SettingsService(app.getPath('userData'))
  const downloadService = new DownloadService()

  // If a library path was previously saved, open it straight away
  const savedPath = settings.get('libraryPath')
  if (savedPath) {
    library = new LibraryService(savedPath)
  }

  registerIpcHandlers({
    settings,
    getLibrary: () => library,
    setLibrary: (s) => {
      library = s
    },
    downloadService
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  library?.close()
})
