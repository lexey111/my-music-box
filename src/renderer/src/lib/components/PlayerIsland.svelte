<script lang="ts">
  import { tracks } from '../stores/app'
  import { player, playAll, togglePlay, playNext, playPrev, seek, setVolume } from '../stores/player'

  export let isMini = false
  export let onToggleMini: () => void = () => {}

  let volume = 1
  let islandWidth = 0

  $: isWide = isMini ? islandWidth > 700 : islandWidth > 800
  $: isCompact = isMini && islandWidth < 450
  $: isUltraCompact = isMini && islandWidth < 300
  $: isStackedVolume = isMini && islandWidth <= 250

  $: miniHeight = isWide ? 56 : isStackedVolume ? 96 : isUltraCompact ? 76 : isCompact ? 60 : 88
  $: if (isMini && islandWidth > 0) window.api.player.notifyLayoutChanged(miniHeight)

  function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function handleProgressClick(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    seek((e.clientX - rect.left) / rect.width)
  }

  function handleVolumeChange(e: Event): void {
    volume = parseFloat((e.target as HTMLInputElement).value)
    setVolume(volume)
  }

  $: progress = $player.duration > 0 ? ($player.currentTime / $player.duration) * 100 : 0
  $: queueActive = $player.mode === 'queue'
  $: trackLabel = $player.currentTrack
    ? `${$player.currentTrack.title}${$player.currentTrack.artist ? ' – ' + $player.currentTrack.artist : ''}`
    : isMini
      ? 'No track — click Play All to start'
      : 'No track — click Play All or any track to start'
</script>

<div class="player-island" class:wide={isWide} class:compact={isCompact} class:ultra={isUltraCompact} class:stacked={isStackedVolume} class:mini={isMini} bind:clientWidth={islandWidth}>

  <div class="controls">
    <button class="btn-play-all" on:click={() => playAll($tracks)}>⇌ Play All</button>
    <div class="transport">
      <button class="transport-btn" disabled={!queueActive} on:click={playPrev} title="Previous">⏮</button>
      <button
        class="transport-btn play-pause"
        disabled={$player.mode === 'idle'}
        on:click={togglePlay}
        title={$player.isPlaying ? 'Pause' : 'Play'}
      >{$player.isPlaying ? '⏸' : '▶'}</button>
      <button class="transport-btn" disabled={!queueActive} on:click={playNext} title="Next">⏭</button>
    </div>
  </div>

  <span class="track-label" title={trackLabel}>{trackLabel}</span>

  <div class="scrubber-row">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="progress-bar" on:click={handleProgressClick}>
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
    <span class="time">{formatTime($player.currentTime)}&nbsp;/&nbsp;{formatTime($player.duration)}</span>
    <input
      class="volume-slider"
      type="range" min="0" max="1" step="0.02"
      value={volume}
      on:input={handleVolumeChange}
      title="Volume"
    />
  </div>

  <button class="btn-mini-toggle" on:click={onToggleMini} title={isMini ? 'Expand' : 'Mini player'}>
    {isMini ? '⊞' : '⊟'}
  </button>

</div>

<style>
  /* ── Base (narrow / two-line) ─────────────────────────────────────────────── */

  .player-island {
    background: var(--bg);
    border-radius: 8px;
    padding: 8px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-play-all {
    font-size: 12px;
    padding: 4px 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .transport-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 13px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .transport-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .play-pause {
    width: 34px;
    height: 34px;
    font-size: 14px;
  }

  .track-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--fg);
  }

  /* Narrow: grid so controls + label share row 1, scrubber + toggle span row 2 */
  .player-island:not(.wide) {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 6px;
  }

  .player-island:not(.wide) .controls     { grid-column: 1;    grid-row: 1; }
  .player-island:not(.wide) .track-label  { grid-column: 2;    grid-row: 1; align-self: center; }
  .player-island:not(.wide) .btn-mini-toggle { grid-column: 3; grid-row: 1; align-self: center; }
  .player-island:not(.wide) .scrubber-row { grid-column: 1 / -1; grid-row: 2; }

  /* ── Wide (single-line) ───────────────────────────────────────────────────── */

  .wide {
    flex-direction: row;
    align-items: center;
    padding: 0 14px;
    gap: 10px;
    height: 48px;
  }

  .wide .controls    { flex-shrink: 0; }
  .wide .track-label { flex: 0 1 120px; }
  .wide .scrubber-row { flex: 1; min-width: 0; }
  .wide .btn-mini-toggle { flex-shrink: 0; }

  /* ── Mini mode ────────────────────────────────────────────────────────────── */

  .mini {
    border-radius: 8px;
    flex: 1;
    height: auto;
    padding: 6px 12px 8px;
    -webkit-app-region: drag;
  }

  /* Every interactive child must opt out of the drag region.
     .track-label is intentionally omitted so it stays draggable. */
  .mini .controls,
  .mini .btn-play-all,
  .mini .transport,
  .mini .transport-btn,
  .mini .scrubber-row,
  .mini .progress-bar,
  .mini .volume-slider,
  .mini .btn-mini-toggle {
    -webkit-app-region: no-drag;
  }

  /* ── Scrubber row (shared) ────────────────────────────────────────────────── */

  .scrubber-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    pointer-events: none;
    transition: width 0.1s linear;
  }

  .time {
    font-size: 11px;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .volume-slider {
    width: 90px;
    flex-shrink: 0;
    accent-color: var(--accent);
    cursor: pointer;
    margin-right: 4px; /* keep thumb away from adjacent toggle button */
  }

  /* ── Mini toggle button ───────────────────────────────────────────────────── */

  .btn-mini-toggle {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: var(--radius);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.12s;
    flex-shrink: 0;
  }

  .btn-mini-toggle:hover {
    opacity: 1;
  }

  /* ── Compact mini (<450px) ────────────────────────────────────────────────── */

  .mini.compact {
    padding: 5px 8px 8px;
    row-gap: 5px;
    column-gap: 6px;
  }

  .mini.compact .btn-play-all {
    font-size: 10px;
    padding: 2px 6px;
    height: 20px;
    line-height: 1;
  }

  .mini.compact .transport-btn {
    width: 20px;
    height: 20px;
    font-size: 10px;
  }

  .mini.compact .play-pause {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }

  .mini.compact .track-label {
    font-size: 11px;
  }

  .mini.compact .time {
    font-size: 9px;
  }

  .mini.compact .volume-slider {
    width: 50px;
    -webkit-appearance: none;
    background: transparent;
  }

  .mini.compact .volume-slider::-webkit-slider-runnable-track {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
  }

  .mini.compact .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    margin-top: -3.5px;
  }

  .mini.compact .btn-mini-toggle {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }

  /* ── Ultra-compact mini (< 350px): 3-row layout ─────────────────────────── */

  .mini.ultra:not(.wide) {
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto auto auto;
    column-gap: 6px;
    row-gap: 6px;
  }

  .mini.ultra:not(.wide) .controls        { grid-column: 1; grid-row: 1; }
  .mini.ultra:not(.wide) .btn-mini-toggle { grid-column: 3; grid-row: 1; align-self: center; }
  .mini.ultra:not(.wide) .track-label     { grid-column: 1 / -1; grid-row: 2; }
  .mini.ultra:not(.wide) .scrubber-row    { grid-column: 1 / -1; grid-row: 3; }

  /* ── Stacked mini (≤ 300px): volume wraps to its own 4th line ──────────── */

  .mini.stacked .scrubber-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    row-gap: 7px;
    column-gap: 10px;
  }

  .mini.stacked .progress-bar  { grid-column: 1; grid-row: 1; align-self: center; }
  .mini.stacked .time          { grid-column: 2; grid-row: 1; align-self: center; }
  .mini.stacked .volume-slider { grid-column: 1; grid-row: 2; width: 100%; margin-right: 0; }
</style>
