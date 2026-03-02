import { app, BrowserWindow, shell, nativeTheme, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { LibraryService } from './services/LibraryService'
import { SettingsService } from './services/SettingsService'
import { DownloadService } from './services/DownloadService'
import { registerIpcHandlers } from './ipc/handlers'

// Allow audio playback without a synchronous user gesture.
// After an `await` (e.g. the IPC call that reads the audio file) the user-
// gesture token is lost and Chromium silently blocks audio.play(). This
// switch re-enables autoplay for the whole app, which is correct behaviour
// for a music player.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let library: LibraryService | null = null
let prevBounds: Rectangle | null = null
let isMiniMode = false

function createWindow(backgroundColor = '#e8e8e8'): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor,
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

  ipcMain.handle('player:setMiniMode', (_, mini: boolean) => {
    if (!mainWindow) return
    isMiniMode = mini
    if (mini) {
      prevBounds = mainWindow.getBounds()
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(190, 88)
      mainWindow.setMaximumSize(1000, 88)
      mainWindow.setSize(500, 88, true)
      mainWindow.setAlwaysOnTop(true, 'floating')
      if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(false)
    } else {
      mainWindow.setAlwaysOnTop(false)
      if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(true)
      mainWindow.setMinimumSize(800, 560)
      mainWindow.setMaximumSize(9999, 9999)
      mainWindow.setResizable(true)
      if (prevBounds) mainWindow.setBounds(prevBounds, true)
      else mainWindow.setSize(1200, 780, true)
    }
  })

  ipcMain.handle('player:notifyLayoutChanged', (_, height: number) => {
    if (!mainWindow || !isMiniMode) return
    const { width } = mainWindow.getBounds()
    mainWindow.setMinimumSize(190, height)
    mainWindow.setMaximumSize(1000, height)
    mainWindow.setSize(width, height, true)
  })

  const savedTheme = settings.get('theme') ?? 'system'
  nativeTheme.themeSource = savedTheme as 'system' | 'light' | 'dark'
  const isDark =
    savedTheme === 'dark' || (savedTheme === 'system' && nativeTheme.shouldUseDarkColors)
  createWindow(isDark ? '#111111' : '#e8e8e8')

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
