"use strict";
const electron = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");
const crypto = require("crypto");
const child_process = require("child_process");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
class LibraryService {
  db;
  tracksDir;
  constructor(libraryPath) {
    this.tracksDir = path.join(libraryPath, "tracks");
    if (!fs.existsSync(this.tracksDir)) {
      fs.mkdirSync(this.tracksDir, { recursive: true });
    }
    this.db = new Database(path.join(libraryPath, "library.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id        INTEGER PRIMARY KEY,
        title     TEXT NOT NULL,
        artist    TEXT,
        original_query TEXT,
        source_url     TEXT,
        duration  INTEGER,
        bitrate   INTEGER,
        file_size INTEGER,
        added_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        normalized INTEGER DEFAULT 0,
        status    TEXT DEFAULT 'ok',
        hash      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_title  ON tracks(title);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_hash   ON tracks(hash);
    `);
  }
  getTracks(search) {
    if (!search || search.trim() === "") {
      return this.db.prepare("SELECT * FROM tracks ORDER BY added_at DESC").all();
    }
    const q = `%${search.trim()}%`;
    return this.db.prepare(
      "SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? ORDER BY added_at DESC"
    ).all(q, q);
  }
  getTrack(id) {
    return this.db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) ?? null;
  }
  deleteTrack(id) {
    const track = this.getTrack(id);
    if (!track) return false;
    const filePath = this.filePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
    return true;
  }
  deleteTracks(ids) {
    const deleteMany = this.db.transaction((ids2) => {
      let deleted = 0;
      for (const id of ids2) {
        if (this.deleteTrack(id)) deleted++;
      }
      return deleted;
    });
    return deleteMany(ids);
  }
  sync() {
    const rows = this.db.prepare("SELECT id, status FROM tracks").all();
    const updateStatus = this.db.prepare("UPDATE tracks SET status = ? WHERE id = ?");
    let markedMissing = 0;
    let restored = 0;
    const runSync = this.db.transaction(() => {
      for (const row of rows) {
        const exists = fs.existsSync(this.filePath(row.id));
        if (!exists && row.status === "ok") {
          updateStatus.run("missing", row.id);
          markedMissing++;
        } else if (exists && row.status === "missing") {
          updateStatus.run("ok", row.id);
          restored++;
        }
      }
    });
    runSync();
    return { markedMissing, restored, totalTracks: rows.length };
  }
  filePath(id) {
    return path.join(this.tracksDir, `${String(id).padStart(6, "0")}.mp3`);
  }
  insertTrack(input, tempFilePath) {
    const stmt = this.db.prepare(`
      INSERT INTO tracks (title, artist, original_query, source_url, duration, bitrate, normalized)
      VALUES (@title, @artist, @original_query, @source_url, @duration, @bitrate, @normalized)
    `);
    const result = stmt.run(input);
    const id = result.lastInsertRowid;
    const dest = this.filePath(id);
    fs.renameSync(tempFilePath, dest);
    const { size } = fs.statSync(dest);
    const hash = this.md5(dest);
    this.db.prepare("UPDATE tracks SET file_size = ?, hash = ? WHERE id = ?").run(size, hash, id);
    return this.getTrack(id);
  }
  md5(filePath) {
    const hash = crypto.createHash("md5");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  }
  close() {
    this.db.close();
  }
}
const defaults = {
  libraryPath: null,
  bitrate: 256,
  normalization: true,
  normalizationLufs: -14,
  theme: "system",
  cookiesBrowser: "safari"
};
class SettingsService {
  filePath;
  settings;
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "settings.json");
    this.settings = this.load();
  }
  load() {
    if (!fs.existsSync(this.filePath)) return { ...defaults };
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return { ...defaults };
    }
  }
  get(key) {
    return this.settings[key];
  }
  set(key, value) {
    this.settings[key] = value;
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), "utf-8");
  }
  getAll() {
    return { ...this.settings };
  }
}
const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];
function humanizeError(raw) {
  if (raw.includes("Operation not permitted") && raw.includes("Cookies")) {
    const browser = raw.includes("Safari") ? "Safari" : "your browser";
    return `${browser} cookies are protected by macOS. Grant Full Disk Access: System Settings → Privacy & Security → Full Disk Access → add this app. Or switch to Brave in the Cookies picker (it works without extra permissions).`;
  }
  if (raw.includes("Sign in to confirm") || raw.includes("bot")) {
    return `YouTube requires you to be signed in. Make sure you are logged into YouTube in the browser selected in the Cookies picker, then try again.`;
  }
  if (raw.includes("Video unavailable") || raw.includes("Private video")) {
    return `This video is unavailable or private.`;
  }
  if (raw.includes("not available in your country")) {
    return `This video is not available in your region.`;
  }
  return raw;
}
function findBinary(name) {
  try {
    const result = child_process.execSync(`which ${name}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return result.trim() || null;
  } catch {
  }
  for (const dir of EXTRA_PATHS) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}
class DownloadService {
  activeJobs = /* @__PURE__ */ new Map();
  async checkDependencies() {
    return {
      ytdlp: findBinary("yt-dlp") !== null,
      ffmpeg: findBinary("ffmpeg") !== null
    };
  }
  async search(query, cookiesBrowser) {
    const ytdlp = findBinary("yt-dlp");
    if (!ytdlp) throw new Error("yt-dlp not found");
    return new Promise((resolve, reject) => {
      const args = [
        `ytsearch5:${query}`,
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        ...cookiesBrowser !== "none" ? ["--cookies-from-browser", cookiesBrowser] : []
      ];
      const proc = child_process.spawn(ytdlp, args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", (code) => {
        if (code !== 0 && stdout.trim() === "") {
          const raw = stderr.split("\n").find((l) => l.trimStart().startsWith("ERROR:"))?.trim() ?? stderr.trim().split("\n").filter((l) => l.trim()).pop() ?? `yt-dlp exited with code ${code}`;
          return reject(new Error(humanizeError(raw)));
        }
        const results = [];
        for (const line of stdout.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            const videoId = obj.id ?? "";
            const ytUrl = (u) => typeof u === "string" && u.startsWith("http") ? u : "";
            const fallback = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
            results.push({
              id: videoId,
              title: obj.title ?? "Unknown",
              uploader: obj.uploader ?? obj.channel ?? null,
              duration: typeof obj.duration === "number" ? obj.duration : null,
              url: ytUrl(obj.url) || ytUrl(obj.webpage_url) || fallback,
              webpage_url: ytUrl(obj.webpage_url) || ytUrl(obj.url) || fallback,
              thumbnail: obj.thumbnail ?? null
            });
          } catch {
          }
        }
        resolve(results.slice(0, 5));
      });
      proc.on("error", reject);
    });
  }
  startDownload(jobId, url, title, artist, settings, libraryService, sendProgress, sendComplete, sendError) {
    const job = { process: null, cancelled: false };
    this.activeJobs.set(jobId, job);
    const tmpDir = path.join(libraryService.tracksDir, ".tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpBase = path.join(tmpDir, jobId);
    this.runDownload(jobId, url, title, artist, settings, libraryService, tmpBase, job, sendProgress, sendComplete, sendError);
  }
  async runDownload(jobId, url, title, artist, settings, libraryService, tmpBase, job, sendProgress, sendComplete, sendError) {
    const rawMp3 = `${tmpBase}.mp3`;
    const normMp3 = `${tmpBase}_norm.mp3`;
    const tmpFiles = [rawMp3, normMp3];
    const cleanup = () => {
      for (const f of tmpFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
        }
      }
      this.activeJobs.delete(jobId);
    };
    try {
      const ytdlp = findBinary("yt-dlp");
      const cb = settings.cookiesBrowser;
      const ytArgs = [
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--newline",
        ...cb !== "none" ? ["--cookies-from-browser", cb] : [],
        "-o",
        `${tmpBase}.%(ext)s`,
        url
      ];
      await new Promise((resolve, reject) => {
        const proc = child_process.spawn(ytdlp, ytArgs);
        job.process = proc;
        let stderrBuf = "";
        const parseProgress = (line) => {
          const match = line.match(/\[download\]\s+([\d.]+)%/);
          if (match) {
            const pct = Math.round(parseFloat(match[1]) * 0.9);
            sendProgress({ jobId, progress: pct, status: "downloading" });
          }
        };
        proc.stderr.on("data", (d) => {
          const chunk = d.toString();
          stderrBuf += chunk;
          parseProgress(chunk);
        });
        proc.stdout.on("data", (d) => parseProgress(d.toString()));
        proc.on("close", (code) => {
          job.process = null;
          if (job.cancelled) return reject(new Error("cancelled"));
          if (code !== 0) {
            const errorLine = stderrBuf.split("\n").find((l) => l.trimStart().startsWith("ERROR:"))?.trim() ?? stderrBuf.trim().split("\n").filter((l) => l.trim()).pop() ?? `yt-dlp exited with code ${code}`;
            return reject(new Error(humanizeError(errorLine)));
          }
          resolve();
        });
        proc.on("error", (err) => {
          job.process = null;
          reject(err);
        });
      });
      if (job.cancelled) {
        cleanup();
        return;
      }
      sendProgress({ jobId, progress: 90, status: "processing" });
      const ffmpeg = findBinary("ffmpeg");
      let finalTmp = rawMp3;
      if (settings.normalization) {
        const lufs = settings.normalizationLufs ?? -14;
        const ffArgs = [
          "-y",
          "-i",
          rawMp3,
          "-af",
          `loudnorm=I=${lufs}:LRA=11:TP=-1.5`,
          "-b:a",
          `${settings.bitrate}k`,
          "-map_metadata",
          "-1",
          normMp3
        ];
        await new Promise((resolve, reject) => {
          const proc = child_process.spawn(ffmpeg, ffArgs);
          job.process = proc;
          proc.on("close", (code) => {
            job.process = null;
            if (job.cancelled) return reject(new Error("cancelled"));
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
            resolve();
          });
          proc.on("error", (err) => {
            job.process = null;
            reject(err);
          });
        });
        finalTmp = normMp3;
      } else {
        const normOut = `${tmpBase}_enc.mp3`;
        tmpFiles.push(normOut);
        const ffArgs = [
          "-y",
          "-i",
          rawMp3,
          "-b:a",
          `${settings.bitrate}k`,
          "-map_metadata",
          "-1",
          normOut
        ];
        await new Promise((resolve, reject) => {
          const proc = child_process.spawn(ffmpeg, ffArgs);
          job.process = proc;
          proc.on("close", (code) => {
            job.process = null;
            if (job.cancelled) return reject(new Error("cancelled"));
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
            resolve();
          });
          proc.on("error", (err) => {
            job.process = null;
            reject(err);
          });
        });
        finalTmp = normOut;
      }
      if (job.cancelled) {
        cleanup();
        return;
      }
      sendProgress({ jobId, progress: 99, status: "processing" });
      const track = libraryService.insertTrack(
        {
          title,
          artist,
          original_query: null,
          source_url: url,
          duration: null,
          bitrate: settings.bitrate,
          normalized: settings.normalization ? 1 : 0
        },
        finalTmp
      );
      for (const f of tmpFiles) {
        if (f !== finalTmp) {
          try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          } catch {
          }
        }
      }
      this.activeJobs.delete(jobId);
      sendComplete({ jobId, track });
    } catch (err) {
      cleanup();
      if (err.message === "cancelled") return;
      sendError({ jobId, error: err.message });
    }
  }
  cancelDownload(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    job.cancelled = true;
    job.process?.kill("SIGTERM");
  }
}
function registerIpcHandlers({ settings, getLibrary, setLibrary, downloadService }) {
  electron.ipcMain.handle("settings:getAll", () => settings.getAll());
  electron.ipcMain.handle("settings:set", (_, key, value) => {
    settings.set(key, value);
    return settings.getAll();
  });
  electron.ipcMain.handle("settings:selectLibraryPath", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select or create your Music Library folder"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const libraryPath = result.filePaths[0];
    const old = getLibrary();
    if (old) old.close();
    const library2 = new LibraryService(libraryPath);
    setLibrary(library2);
    settings.set("libraryPath", libraryPath);
    return libraryPath;
  });
  electron.ipcMain.handle("app:getMemoryMB", () => {
    const total = electron.app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0);
    return Math.round(total / 1024);
  });
  electron.ipcMain.handle("library:getTracks", (_, search) => {
    return getLibrary()?.getTracks(search) ?? [];
  });
  electron.ipcMain.handle("library:deleteTrack", (_, id) => {
    return getLibrary()?.deleteTrack(id) ?? false;
  });
  electron.ipcMain.handle("library:deleteTracks", (_, ids) => {
    return getLibrary()?.deleteTracks(ids) ?? 0;
  });
  electron.ipcMain.handle("library:sync", () => {
    return getLibrary()?.sync() ?? { markedMissing: 0, restored: 0, totalTracks: 0 };
  });
  electron.ipcMain.handle("download:checkDeps", () => downloadService.checkDependencies());
  electron.ipcMain.handle(
    "download:search",
    (_, query) => downloadService.search(query, settings.get("cookiesBrowser"))
  );
  electron.ipcMain.handle("download:start", (event, url, title, artist) => {
    const library2 = getLibrary();
    if (!library2) throw new Error("No library selected");
    const jobId = crypto.randomUUID();
    const s = settings.getAll();
    downloadService.startDownload(
      jobId,
      url,
      title,
      artist,
      { bitrate: s.bitrate, normalization: s.normalization, normalizationLufs: s.normalizationLufs, cookiesBrowser: s.cookiesBrowser },
      library2,
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send("download:progress", payload);
      },
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send("download:complete", payload);
      },
      (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send("download:error", payload);
      }
    );
    return jobId;
  });
  electron.ipcMain.handle("download:cancel", (_, jobId) => downloadService.cancelDownload(jobId));
}
let mainWindow = null;
let library = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    // native macOS traffic lights
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.musicbox.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  const settings = new SettingsService(electron.app.getPath("userData"));
  const downloadService = new DownloadService();
  const savedPath = settings.get("libraryPath");
  if (savedPath) {
    library = new LibraryService(savedPath);
  }
  registerIpcHandlers({
    settings,
    getLibrary: () => library,
    setLibrary: (s) => {
      library = s;
    },
    downloadService
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  library?.close();
});
