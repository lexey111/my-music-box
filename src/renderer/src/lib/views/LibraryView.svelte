<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import {
    tracks,
    search,
    loading,
    selectedIds,
    loadTracks,
    deleteTracks,
    sync,
    toggleSelect,
    clearSelection,
    selectMissing,
    activeTab
  } from '../stores/app'
  import { redownloadTrack } from '../stores/downloads'
  import { player, playTrack, togglePlay } from '../stores/player'

  function handleRedownload(track: Track): void {
    redownloadTrack(track)
    $activeTab = 'addMusic'
  }
  // ── Virtual list ───────────────────────────────────────────────────────────

  let listEl: HTMLDivElement | undefined

  // Recreates the virtualizer whenever the list element or track count changes.
  // The scroll position resets on search — intentional and expected.
  $: virtualizer =
    listEl &&
    createVirtualizer({
      count: $tracks.length,
      getScrollElement: () => listEl!,
      estimateSize: () => 40,
      overscan: 20
    })

  // ── Search ─────────────────────────────────────────────────────────────────

  let searchDebounce: ReturnType<typeof setTimeout>

  function handleSearch(e: Event): void {
    const value = (e.target as HTMLInputElement).value
    search.set(value)
    clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => loadTracks(value || undefined), 200)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(): Promise<void> {
    const ids = [...$selectedIds]
    if (ids.length === 0) return
    const ok = confirm(
      `Delete ${ids.length} track${ids.length === 1 ? '' : 's'} and their files? This cannot be undone.`
    )
    if (ok) await deleteTracks(ids)
  }

  $: missingCount = $tracks.filter(t => t.status === 'missing').length

  // ── Sync ───────────────────────────────────────────────────────────────────

  let syncResult: SyncResult | null = null
  let syncing = false

  async function handleSync(): Promise<void> {
    syncing = true
    try {
      syncResult = await sync()
    } finally {
      syncing = false
      setTimeout(() => (syncResult = null), 4000)
    }
  }


  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDuration(seconds: number | null): string {
    if (seconds == null) return '—'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function formatSize(bytes: number | null): string {
    if (bytes == null) return '—'
    return `${(bytes / 1_048_576).toFixed(1)} MB`
  }

  function handleRowClick(e: MouseEvent, id: number): void {
    toggleSelect(id)
  }
</script>

<div class="library">
  <!-- ── Toolbar ─────────────────────────────────────────────────────────── -->
  <div class="toolbar">
    <input
      type="search"
      placeholder="Search by title or artist…"
      value={$search}
      on:input={handleSearch}
    />

    <span class="info">
      {#if $loading}
        Loading…
      {:else if $selectedIds.size > 0}
        {$selectedIds.size} selected of {$tracks.length}
      {:else}
        {$tracks.length} tracks
      {/if}
    </span>

    <div class="actions">
      {#if $selectedIds.size > 0}
        <button on:click={clearSelection}>Deselect all</button>
        <button class="danger" on:click={handleDelete}>
          Delete ({$selectedIds.size})
        </button>
      {:else if missingCount > 0}
        <button class="danger-soft" on:click={selectMissing}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Select missing ({missingCount})
        </button>
      {/if}
      {#if syncResult}
        <span class="sync-result">
          {syncResult.markedMissing} missing, {syncResult.restored} restored
        </span>
      {/if}
      <button on:click={handleSync} disabled={syncing}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {#if syncing}
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20" stroke-dashoffset="8" stroke-linecap="round" style="animation: btn-spin 0.8s linear infinite; transform-origin: center"/>
          {:else}
            <rect x="2" y="3" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 7h5M5 10h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="12.5" cy="3.5" r="2" fill="currentColor" opacity="0.7"/>
          {/if}
        </svg>
        {syncing ? 'Checking…' : 'Check files'}
      </button>
    </div>
  </div>

  <!-- ── Column headers ─────────────────────────────────────────────────── -->
  <div class="header-row">
    <span class="col-check"></span>
    <span class="col-status"></span>
    <span class="col-title">Title</span>
    <span class="col-artist">Artist</span>
    <span class="col-duration">Duration</span>
    <span class="col-size">Size</span>
    <span class="col-action"></span>
  </div>

  <!-- ── Virtual list ───────────────────────────────────────────────────── -->
  <div class="list" bind:this={listEl}>
    {#if $loading}
      <div class="empty">Loading…</div>
    {:else if $tracks.length === 0}
      <div class="empty">
        {$search ? 'No tracks match your search.' : 'No tracks yet. Download some music!'}
      </div>
    {:else if virtualizer}
      <div style="height: {$virtualizer.getTotalSize()}px; position: relative">
        {#each $virtualizer.getVirtualItems() as row (row.index)}
          {@const track = $tracks[row.index]}
          {@const isSelected = $selectedIds.has(track.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="track-row"
            class:selected={isSelected}
            class:missing={track.status === 'missing'}
            style="position: absolute; top: 0; left: 0; width: 100%; height: {row.size}px; transform: translateY({row.start}px)"
            on:click={(e) => handleRowClick(e, track.id)}
          >
            <span class="col-check">
              <input
                type="checkbox"
                checked={isSelected}
                on:click|stopPropagation={() => toggleSelect(track.id)}
              />
            </span>
            <span class="col-status">
              <span class="dot" class:dot-missing={track.status === 'missing'} title={track.status}></span>
            </span>
            <span class="col-title" title={track.title}>{track.title}</span>
            <span class="col-artist" title={track.artist ?? ''}>{track.artist ?? '—'}</span>
            <span class="col-duration">{formatDuration(track.duration)}</span>
            <span class="col-size">{formatSize(track.file_size)}</span>
            <span class="col-action">
              {#if track.status === 'missing'}
                <button class="btn-redownload" on:click|stopPropagation={() => handleRedownload(track)}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 2v8M5 7.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  Download again
                </button>
              {:else}
                {@const isActive = $player.currentTrack?.id === track.id}
                {@const isPlaying = isActive && $player.isPlaying}
                {@const progress = isActive && $player.duration > 0 ? $player.currentTime / $player.duration : 0}
                {@const circ = 2 * Math.PI * 12}
                <button
                  class="btn-play"
                  class:active={isActive}
                  on:click|stopPropagation={() => isActive ? togglePlay() : playTrack(track, $tracks)}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {#if isActive}
                    <svg class="progress-ring" viewBox="0 0 30 30" aria-hidden="true">
                      <circle class="ring-track" cx="15" cy="15" r="12" />
                      <circle
                        class="ring-fill"
                        cx="15" cy="15" r="12"
                        style="stroke-dasharray: {circ}; stroke-dashoffset: {circ * (1 - progress)}"
                      />
                    </svg>
                  {/if}
                  {isPlaying ? '⏸' : '▶'}
                </button>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

</div>

<style>
  .library {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Toolbar ────────────────────────────────────────────────────────────── */

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    height: var(--toolbar-height);
    background: var(--bg-toolbar);
  }

  .toolbar input[type='search'] {
    width: 240px;
  }

  .info {
    color: var(--fg-muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .sync-result {
    font-size: 12px;
    color: var(--accent);
  }

  .actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .danger-soft {
    color: var(--error);
    opacity: 0.8;
  }

  .danger-soft:hover {
    opacity: 1;
  }

  @keyframes btn-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Column header ──────────────────────────────────────────────────────── */

  .header-row {
    display: flex;
    align-items: center;
    height: var(--header-height);
    padding: 0 12px;
    border-bottom: 1px solid var(--separator);
    background: var(--bg-toolbar);
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    user-select: none;
  }

  /* ── Virtual scroll container ───────────────────────────────────────────── */

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Track rows ─────────────────────────────────────────────────────────── */

  .track-row {
    display: flex;
    align-items: center;
    padding: 0 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--separator);
    transition: background 0.08s;
  }

  .track-row:hover {
    background: var(--bg-hover);
  }

  .track-row.selected {
    background: var(--bg-selected);
  }

  .track-row.missing {
    background: var(--error-bg);
  }

  .track-row.missing .col-title {
    text-decoration: line-through;
    color: var(--fg-muted);
  }

  /* ── Columns ────────────────────────────────────────────────────────────── */

  .col-check  { width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .col-status { width: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .col-title  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 12px; }
  .col-artist { width: 180px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); padding-right: 12px; }
  .col-duration { width: 64px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; display: flex; align-items: center; justify-content: flex-end; }
  .col-size   { width: 72px; flex-shrink: 0; color: var(--fg-muted); text-align: right; font-variant-numeric: tabular-nums; }
  .col-action { width: 148px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; }


  /* ── Status dot ─────────────────────────────────────────────────────────── */

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e; /* green = ok */
  }

  .dot.dot-missing {
    background: var(--error);
  }

  /* ── Redownload button ───────────────────────────────────────────────────── */

  .btn-redownload {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  /* ── Play button ─────────────────────────────────────────────────────────── */

  .btn-play {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 10px;
    padding: 0;
    line-height: 1;
    border: none;
    box-shadow: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s;
  }

  /* inactive: show on row hover with a proper circle button look */
  .track-row:hover .btn-play:not(.active) {
    opacity: 0.6;
    border: 1px solid var(--button-border);
    background: var(--bg);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  .track-row:hover .btn-play:not(.active):hover {
    opacity: 1;
    color: var(--accent);
  }

  /* active: always visible, ring handles the circle */
  .btn-play.active {
    opacity: 1;
    color: var(--accent);
  }

  .progress-ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
    transform: rotate(-90deg);
  }

  .ring-track {
    fill: none;
    stroke: var(--separator);
    stroke-width: 2;
  }

  .ring-fill {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.25s linear;
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 120px;
    color: var(--fg-muted);
    font-size: 13px;
  }

</style>
