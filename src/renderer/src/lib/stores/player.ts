import { writable, get } from 'svelte/store'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerMode = 'idle' | 'single' | 'queue'

interface PlayerState {
  mode: PlayerMode
  currentTrack: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  queue: Track[]
  queueIndex: number
}

// ── Audio singleton ───────────────────────────────────────────────────────────

const audio = new Audio()
let currentBlobUrl: string | null = null

// ── Store ─────────────────────────────────────────────────────────────────────

const initialState: PlayerState = {
  mode: 'idle',
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  queue: [],
  queueIndex: 0
}

export const player = writable<PlayerState>(initialState)

// ── Media Session (OS multimedia keys) ───────────────────────────────────────

function syncMediaSession(track: Track | null, isPlaying: boolean): void {
  if (!('mediaSession' in navigator)) return

  if (!track) {
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.metadata = null
    return
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist ?? undefined
  })
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
}

function registerMediaSessionHandlers(): void {
  if (!('mediaSession' in navigator)) return

  navigator.mediaSession.setActionHandler('play', () => togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => togglePlay())
  navigator.mediaSession.setActionHandler('nexttrack', () => playNext())
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrev())
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) audio.currentTime = details.seekTime
  })
}

registerMediaSessionHandlers()

// ── Internal helpers ──────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function loadAndPlay(track: Track): Promise<void> {
  player.update((s) => ({ ...s, currentTrack: track, isPlaying: false, currentTime: 0, duration: 0 }))
  syncMediaSession(track, false)

  let buffer: ArrayBuffer | null
  try {
    buffer = await window.api.library.readAudioFile(track.id)
  } catch (e) {
    console.error('[player] readAudioFile IPC threw', e)
    return
  }

  if (!buffer) { console.error('[player] readAudioFile returned null for id', track.id); return }

  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  currentBlobUrl = URL.createObjectURL(blob)

  audio.src = currentBlobUrl
  audio.load()

  try {
    await audio.play()
  } catch (e) {
    console.error('[player] audio.play() rejected:', e)
  }

  const playing = !audio.paused
  player.update((s) => ({ ...s, isPlaying: playing }))
  syncMediaSession(track, playing)
}

function playQueueTrack(index: number): void {
  const state = get(player)
  const track = state.queue[index]
  player.update((s) => ({ ...s, queueIndex: index }))
  if (track) loadAndPlay(track)
}

// ── Audio event wiring ────────────────────────────────────────────────────────

audio.addEventListener('timeupdate', () => {
  const s = get(player)
  if (!s.currentTrack) return
  player.update((st) => ({ ...st, currentTime: audio.currentTime, duration: audio.duration || 0 }))
  if ('mediaSession' in navigator && audio.duration) {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: audio.currentTime,
      playbackRate: audio.playbackRate
    })
  }
})

audio.addEventListener('ended', () => {
  const s = get(player)
  if (s.mode === 'queue' && s.queue.length > 0) {
    playQueueTrack((s.queueIndex + 1) % s.queue.length)
  } else {
    player.update((st) => ({ ...st, mode: 'idle', isPlaying: false, currentTrack: null, currentTime: 0 }))
    syncMediaSession(null, false)
  }
})

// ── Exported API ──────────────────────────────────────────────────────────────

export function playAll(tracks: Track[]): void {
  const ok = tracks.filter((t) => t.status === 'ok')
  if (ok.length === 0) return
  const queue = shuffle(ok)
  player.update((s) => ({ ...s, mode: 'queue', queue, queueIndex: 0 }))
  loadAndPlay(queue[0])
}

export function playTrack(track: Track, allTracks: Track[]): void {
  const s = get(player)
  if (s.mode === 'queue') {
    const rest = shuffle(s.queue.filter((t) => t.id !== track.id))
    player.update((st) => ({ ...st, queue: [track, ...rest], queueIndex: 0 }))
  } else {
    const ok = allTracks.filter((t) => t.status === 'ok' && t.id !== track.id)
    player.update((st) => ({ ...st, mode: 'queue', queue: [track, ...shuffle(ok)], queueIndex: 0 }))
  }
  loadAndPlay(track)
}

export function togglePlay(): void {
  const s = get(player)
  if (s.isPlaying) {
    audio.pause()
    player.update((st) => ({ ...st, isPlaying: false }))
    syncMediaSession(s.currentTrack, false)
  } else if (s.currentTrack) {
    audio.play().catch((e) => console.error('[player] resume failed:', e))
    player.update((st) => ({ ...st, isPlaying: true }))
    syncMediaSession(s.currentTrack, true)
  }
}

export function playNext(): void {
  const s = get(player)
  if (s.mode !== 'queue' || s.queue.length === 0) return
  playQueueTrack((s.queueIndex + 1) % s.queue.length)
}

export function playPrev(): void {
  const s = get(player)
  if (s.mode !== 'queue' || s.queue.length === 0) return
  if (audio.currentTime > 3) {
    audio.currentTime = 0
  } else {
    playQueueTrack((s.queueIndex - 1 + s.queue.length) % s.queue.length)
  }
}

export function seek(ratio: number): void {
  const s = get(player)
  if (s.duration > 0) {
    audio.currentTime = ratio * s.duration
  }
}
