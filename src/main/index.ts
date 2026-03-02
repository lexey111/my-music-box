import { app, BrowserWindow, shell, nativeTheme, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
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

interface WindowBounds { x: number; y: number; width: number; height: number }
interface WindowState {
  mainBounds?: WindowBounds
  miniBounds?: { x: number; y: number; width: number }
}

let mainWindow: BrowserWindow | null = null
let library: LibraryService | null = null
let isMiniMode = false
let isMiniTransitioning = false
let pendingTransitionHeight: number | null = null
let transitionTimer: ReturnType<typeof setTimeout> | null = null
let windowState: WindowState = {}
let windowStateFilePath = ''

// Mirrors PlayerIsland.svelte miniHeight thresholds so setMiniMode can set
// the correct height in one shot without waiting for notifyLayoutChanged.
function getMiniHeight(width: number): number {
  if (width > 700) return 56
  if (width <= 250) return 80
  if (width < 300) return 64
  if (width < 450) return 60
  return 88
}

function persistWindowState(): void {
  if (!windowStateFilePath) return
  try { writeFileSync(windowStateFilePath, JSON.stringify(windowState, null, 2), 'utf-8') } catch { /* ignore */ }
}

function createWindow(backgroundColor = '#e8e8e8'): void {
  const b = windowState.mainBounds
  mainWindow = new BrowserWindow({
    x: b?.x,
    y: b?.y,
    width: b?.width ?? 1200,
    height: b?.height ?? 780,
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

  // Persist bounds on every resize / move
  const onBoundsChange = (): void => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    if (isMiniMode) {
      windowState.miniBounds = { x: bounds.x, y: bounds.y, width: bounds.width }
    } else {
      windowState.mainBounds = bounds
    }
    persistWindowState()
  }
  mainWindow.on('resize', onBoundsChange)
  mainWindow.on('move', onBoundsChange)

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

  const userDataPath = app.getPath('userData')
  windowStateFilePath = join(userDataPath, 'window-state.json')
  if (existsSync(windowStateFilePath)) {
    try { windowState = JSON.parse(readFileSync(windowStateFilePath, 'utf-8')) } catch { windowState = {} }
  }

  const settings = new SettingsService(userDataPath)
  const downloadService = new DownloadService()

  // If a library path was previously saved, open it straight away
  const savedPath = settings.get('libraryPath')
  if (savedPath) {
    library = new LibraryService(savedPath)
  }

  registerIpcHandlers({
    settings,
    getLibrary: () => library,
    setLibrary: (s) => { library = s },
    downloadService
  })

  const ANIM_MS = 320 // macOS resize animation duration

  ipcMain.handle('player:setMiniMode', (_, mini: boolean) => {
    if (!mainWindow) return
    isMiniMode = mini
    clearTimeout(transitionTimer!)
    if (mini) {
      const saved = windowState.miniBounds
      const width = Math.min(1000, Math.max(190, saved?.width ?? 500))
      const height = getMiniHeight(width)
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(190, height)
      mainWindow.setMaximumSize(1000, height)
      mainWindow.setAlwaysOnTop(true, 'floating')
      if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(false)
      if (saved) mainWindow.setBounds({ x: saved.x, y: saved.y, width, height }, true)
      else mainWindow.setSize(width, height, true)
      // Suppress notifyLayoutChanged during animation, apply buffered height after
      isMiniTransitioning = true
      pendingTransitionHeight = null
      transitionTimer = setTimeout(() => {
        isMiniTransitioning = false
        if (pendingTransitionHeight !== null && mainWindow && isMiniMode) {
          const { width: w } = mainWindow.getBounds()
          mainWindow.setMinimumSize(190, pendingTransitionHeight)
          mainWindow.setMaximumSize(1000, pendingTransitionHeight)
          mainWindow.setSize(w, pendingTransitionHeight, false)
          pendingTransitionHeight = null
        }
      }, ANIM_MS)
    } else {
      isMiniTransitioning = false
      mainWindow.setAlwaysOnTop(false)
      if (process.platform === 'darwin') mainWindow.setWindowButtonVisibility(true)
      mainWindow.setMinimumSize(800, 560)
      mainWindow.setMaximumSize(9999, 9999)
      mainWindow.setResizable(true)
      if (windowState.mainBounds) mainWindow.setBounds(windowState.mainBounds, true)
      else mainWindow.setSize(1200, 780, true)
    }
  })

  ipcMain.handle('player:notifyLayoutChanged', (_, height: number) => {
    if (!mainWindow || !isMiniMode) return
    if (isMiniTransitioning) {
      pendingTransitionHeight = height  // buffer — apply after animation
      return
    }
    const { width } = mainWindow.getBounds()
    mainWindow.setMinimumSize(190, height)
    mainWindow.setMaximumSize(1000, height)
    mainWindow.setSize(width, height, false)
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
