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

  $: isIdle = $player.mode === 'idle'
  $: progress = $player.duration > 0 ? ($player.currentTime / $player.duration) * 100 : 0
  $: queueActive = $player.mode === 'queue'
  $: trackLabel = $player.currentTrack
    ? `${$player.currentTrack.title}${$player.currentTrack.artist ? ' – ' + $player.currentTrack.artist : ''}`
    : isMini
      ? 'No track — click Play All to start'
      : 'No track — click Play All or any track to start'
</script>

<div class="player-island" class:wide={isWide} class:compact={isCompact} class:ultra={isUltraCompact} class:stacked={isStackedVolume} class:mini={isMini} class:idle={isIdle} bind:clientWidth={islandWidth}>

  <div class="controls">
    <button class="btn-play-all" on:click={() => playAll($tracks)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      Play All
    </button>
    {#if !isIdle}
    <div class="transport">
      <button class="transport-btn" disabled={!queueActive} on:click={playPrev} title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="19 20 9 12 19 4 19 20"/>
          <line x1="5" y1="19" x2="5" y2="5"/>
        </svg>
      </button>
      <button
        class="transport-btn play-pause"
        disabled={$player.mode === 'idle'}
        on:click={togglePlay}
        title={$player.isPlaying ? 'Pause' : 'Play'}
      >
        {#if $player.isPlaying}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="10" y1="18" x2="10" y2="6"/>
            <line x1="14" y1="18" x2="14" y2="6"/>
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="7 3 21 12 7 21 7 3"/>
          </svg>
        {/if}
      </button>
      <button class="transport-btn" disabled={!queueActive} on:click={playNext} title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="5 4 15 12 5 20 5 4"/>
          <line x1="19" y1="5" x2="19" y2="19"/>
        </svg>
      </button>
    </div>
    {/if}
  </div>

  <span class="track-label" title={trackLabel}>{trackLabel}</span>

  {#if !isIdle}
  <div class="scrubber-row">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="progress-bar" on:click={handleProgressClick}>
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
    <span class="time">{formatTime($player.currentTime)}&nbsp;/&nbsp;{formatTime($player.duration)}</span>
    {#if !isCompact}
      <svg class="vol-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    {/if}
    <input
      class="volume-slider"
      type="range" min="0" max="1" step="0.02"
      value={volume}
      on:input={handleVolumeChange}
      title="Volume"
    />
  </div>
  {/if}

  <button class="btn-mini-toggle" on:click={onToggleMini} title={isMini ? 'Expand' : 'Mini player'}>
    {#if isMini}
      <!-- FiMaximize: expand to full player -->
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    {:else}
      <!-- FiMinimize: shrink to mini player -->
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
      </svg>
    {/if}
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
    border-radius: 50px;
    white-space: nowrap;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
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
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
    box-shadow: 0 1px 3px rgba(59,130,246,0.35);
  }

  .play-pause:hover {
    opacity: 0.9;
    background: var(--accent);
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
  .wide.idle .track-label { flex: 1; }

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

  .vol-icon {
    flex-shrink: 0;
    opacity: 0.35;
    color: var(--fg);
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

  .mini.compact .controls svg,
  .mini.compact .btn-mini-toggle svg {
    transform: scale(0.7);
  }

  .mini.compact .transport-btn {
    width: 20px;
    height: 20px;
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
