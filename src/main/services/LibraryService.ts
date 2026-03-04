import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync, unlinkSync, renameSync, statSync, readFileSync } from 'fs'
import { createHash } from 'crypto'

export interface Track {
  id: number
  title: string
  artist: string | null
  original_query: string | null
  source_url: string | null
  duration: number | null
  bitrate: number | null
  file_size: number | null
  added_at: string
  normalized: number
  status: 'ok' | 'missing'
  hash: string | null
  filename: string
}

export interface SyncResult {
  markedMissing: number
  restored: number
  totalTracks: number
}

export interface InsertTrackInput {
  title: string
  artist: string | null
  original_query: string | null
  source_url: string | null
  duration: number | null
  bitrate: number | null
  normalized: number
}

export class LibraryService {
  private db: Database.Database
  public readonly tracksDir: string

  constructor(libraryPath: string) {
    this.tracksDir = join(libraryPath, 'tracks')

    if (!existsSync(this.tracksDir)) {
      mkdirSync(this.tracksDir, { recursive: true })
    }

    this.db = new Database(join(libraryPath, 'library.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initSchema()
  }

  private initSchema(): void {
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
    `)

    const cols = this.db.prepare("PRAGMA table_info(tracks)").all() as { name: string }[]
    if (!cols.some(c => c.name === 'filename')) {
      this.db.exec("ALTER TABLE tracks ADD COLUMN filename TEXT")
      this.db.exec("UPDATE tracks SET filename = printf('%06d.mp3', id) WHERE filename IS NULL")
    }
  }

  getTracks(search?: string): Track[] {
    if (!search || search.trim() === '') {
      return this.db
        .prepare('SELECT * FROM tracks ORDER BY added_at DESC')
        .all() as Track[]
    }
    const q = `%${search.trim()}%`
    return this.db
      .prepare(
        'SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? ORDER BY added_at DESC'
      )
      .all(q, q) as Track[]
  }

  getTrack(id: number): Track | null {
    return (this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track) ?? null
  }

  deleteTrack(id: number): boolean {
    const track = this.getTrack(id)
    if (!track) return false

    const filePath = this.filePath(id, track.filename)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    this.db.prepare('DELETE FROM tracks WHERE id = ?').run(id)
    return true
  }

  deleteTracks(ids: number[]): number {
    const deleteMany = this.db.transaction((ids: number[]) => {
      let deleted = 0
      for (const id of ids) {
        if (this.deleteTrack(id)) deleted++
      }
      return deleted
    })
    return deleteMany(ids) as number
  }

  sync(): SyncResult {
    const rows = this.db
      .prepare('SELECT id, status, filename FROM tracks')
      .all() as Pick<Track, 'id' | 'status' | 'filename'>[]

    const updateStatus = this.db.prepare('UPDATE tracks SET status = ? WHERE id = ?')
    let markedMissing = 0
    let restored = 0

    const runSync = this.db.transaction(() => {
      for (const row of rows) {
        const exists = existsSync(this.filePath(row.id, row.filename))
        if (!exists && row.status === 'ok') {
          updateStatus.run('missing', row.id)
          markedMissing++
        } else if (exists && row.status === 'missing') {
          updateStatus.run('ok', row.id)
          restored++
        }
      }
    })

    runSync()
    return { markedMissing, restored, totalTracks: rows.length }
  }

  filePath(_id: number, filename: string): string {
    return join(this.tracksDir, filename)
  }

  private sanitizeForFilename(text: string): string {
    return text
      // Remove emojis and other non-printable Unicode symbols
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\uFE00-\uFE0F]/g, '') // variation selectors
      // Remove filesystem-unsafe chars and control chars
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      // Collapse multiple spaces, trim spaces and dots
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .trim()
  }

  private generateFilename(title: string, artist: string | null, id: number): string {
    const safeTitle = this.sanitizeForFilename(title)
    const safeArtist = artist ? this.sanitizeForFilename(artist) : ''

    let base = safeTitle && safeArtist
      ? `${safeTitle} - ${safeArtist}`
      : safeTitle || safeArtist || String(id).padStart(6, '0')

    if (base.length > 200) base = base.slice(0, 200).trimEnd()

    const checkExists = this.db.prepare('SELECT id FROM tracks WHERE filename = ? AND id != ?')

    let candidate = `${base}.mp3`
    let suffix = 2
    while (
      checkExists.get(candidate, id) !== undefined ||
      existsSync(join(this.tracksDir, candidate))
    ) {
      candidate = `${base} (${suffix}).mp3`
      suffix++
    }
    return candidate
  }

  insertTrack(input: InsertTrackInput, tempFilePath: string): Track {
    // If a track with the same source_url already exists (e.g. missing), update it
    const existing = input.source_url
      ? (this.db.prepare('SELECT * FROM tracks WHERE source_url = ?').get(input.source_url) as Track | undefined)
      : undefined

    if (existing) {
      const newFilename = this.generateFilename(input.title, input.artist, existing.id)
      const dest = this.filePath(existing.id, newFilename)
      if (newFilename !== existing.filename) {
        const oldPath = this.filePath(existing.id, existing.filename)
        if (existsSync(oldPath)) unlinkSync(oldPath)
      }
      renameSync(tempFilePath, dest)
      const { size } = statSync(dest)
      const hash = this.md5(dest)
      this.db.prepare(`
        UPDATE tracks SET title=?, artist=?, duration=?, bitrate=?, normalized=?, status='ok', file_size=?, hash=?, filename=? WHERE id=?
      `).run(input.title, input.artist, input.duration, input.bitrate, input.normalized, size, hash, newFilename, existing.id)
      return this.getTrack(existing.id)!
    }

    const result = this.db.prepare(`
      INSERT INTO tracks (title, artist, original_query, source_url, duration, bitrate, normalized)
      VALUES (@title, @artist, @original_query, @source_url, @duration, @bitrate, @normalized)
    `).run(input)
    const id = result.lastInsertRowid as number

    const filename = this.generateFilename(input.title, input.artist, id)
    const dest = this.filePath(id, filename)
    renameSync(tempFilePath, dest)

    const { size } = statSync(dest)
    const hash = this.md5(dest)

    this.db
      .prepare('UPDATE tracks SET file_size = ?, hash = ?, filename = ? WHERE id = ?')
      .run(size, hash, filename, id)

    return this.getTrack(id)!
  }

  findByMeta(title: string, artist: string | null, duration: number | null): boolean {
    const row = this.db.prepare(`
      SELECT id FROM tracks
      WHERE LOWER(title) = LOWER(?)
        AND LOWER(COALESCE(artist,'')) = LOWER(COALESCE(?,''))
        AND ABS(COALESCE(duration,0) - COALESCE(?,0)) <= 3
      LIMIT 1
    `).get(title, artist, duration)
    return !!row
  }

  private md5(filePath: string): string {
    const hash = createHash('md5')
    hash.update(readFileSync(filePath))
    return hash.digest('hex')
  }

  close(): void {
    this.db.close()
  }
}
