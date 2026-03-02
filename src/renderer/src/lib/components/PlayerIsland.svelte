<script lang="ts">
  import { tracks } from '../stores/app'
  import { player, playAll, togglePlay, playNext, playPrev, seek } from '../stores/player'

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

  $: progress = $player.duration > 0 ? ($player.currentTime / $player.duration) * 100 : 0
  $: queueActive = $player.mode === 'queue'
  $: trackLabel = $player.currentTrack
    ? `${$player.currentTrack.title}${$player.currentTrack.artist ? ' – ' + $player.currentTrack.artist : ''}`
    : 'No track'
</script>

<div class="player-island">
  <div class="controls">
    <button class="btn-play-all" on:click={() => playAll($tracks)}>
      ⇌ Play All
    </button>

    <div class="transport">
      <button
        class="transport-btn"
        disabled={!queueActive}
        on:click={playPrev}
        title="Previous"
      >⏮</button>

      <button
        class="transport-btn play-pause"
        disabled={$player.mode === 'idle'}
        on:click={togglePlay}
        title={$player.isPlaying ? 'Pause' : 'Play'}
      >
        {$player.isPlaying ? '⏸' : '▶'}
      </button>

      <button
        class="transport-btn"
        disabled={!queueActive}
        on:click={playNext}
        title="Next"
      >⏭</button>
    </div>

    <div class="track-info">
      <span class="track-label" title={trackLabel}>{trackLabel}</span>
      <span class="time">
        {formatTime($player.currentTime)} / {formatTime($player.duration)}
      </span>
    </div>
  </div>

  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="progress-bar" on:click={handleProgressClick}>
    <div class="progress-fill" style="width: {progress}%"></div>
  </div>
</div>

<style>
  .player-island {
    background: var(--bg);
    border-radius: 8px;
    padding: 10px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
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

  .track-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
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

  .time {
    font-size: 12px;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .progress-bar {
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
</style>
