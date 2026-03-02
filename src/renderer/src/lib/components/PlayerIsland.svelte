<script lang="ts">
  import { tracks } from '../stores/app'
  import { player, playAll, togglePlay, playNext, playPrev, seek, setVolume } from '../stores/player'

  let volume = 1
  let islandWidth = 0
  $: isWide = islandWidth > 800

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
    : 'No track'
</script>

<div class="player-island" class:wide={isWide} bind:clientWidth={islandWidth}>

  <!-- Transport buttons + Play All -->
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

  <!-- Track title — between transport and scrubber in wide mode -->
  <span class="track-label" title={trackLabel}>{trackLabel}</span>

  <!-- Progress bar + time + volume -->
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

  /* In narrow mode the label sits on the same line as controls */
  .track-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--fg);
  }

  /* Narrow: controls + label share the first line via the column's implicit row */
  .player-island:not(.wide) .controls {
    /* Let the label (sibling) sit next to controls by wrapping them in a row */
  }

  /* Achieve "controls + label on one line" in narrow mode without an extra wrapper:
     make the island's column behave as a two-row grid where row 1 is a flex row. */
  .player-island:not(.wide) {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 6px;
  }

  .player-island:not(.wide) .controls   { grid-column: 1; grid-row: 1; }
  .player-island:not(.wide) .track-label { grid-column: 2; grid-row: 1; align-self: center; }
  .player-island:not(.wide) .scrubber-row { grid-column: 1 / -1; grid-row: 2; }

  /* ── Wide (single-line) ───────────────────────────────────────────────────── */

  .wide {
    flex-direction: row;
    align-items: center;
    padding: 0 14px;
    gap: 12px;
    height: 48px;
  }

  .wide .controls   { flex-shrink: 0; }
  .wide .track-label { flex: 0 1 200px; }   /* grows up to 200px, can shrink */
  .wide .scrubber-row { flex: 1; min-width: 0; }

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
  }
</style>
