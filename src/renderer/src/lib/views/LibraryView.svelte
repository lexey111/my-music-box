<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import {
    tracks,
    search,
    loading,
    selectedIds,
    libraryPath,
    loadTracks,
    deleteTracks,
    sync,
    toggleSelect,
    clearSelection,
    selectLibraryPath
  } from '../stores/app'
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

  // ── Memory usage ───────────────────────────────────────────────────────────

  let memMB = ''
  let memTimer: ReturnType<typeof setInterval>

  async function updateMem(): Promise<void> {
    const mb = await window.api.app.getMemoryMB()
    memMB = `${mb} MB`
  }

  onMount(() => { updateMem(); memTimer = setInterval(updateMem, 3000) })
  onDestroy(() => clearInterval(memTimer))

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

    {#if syncResult}
      <span class="sync-result">
        Sync: {syncResult.markedMissing} missing, {syncResult.restored} restored
      </span>
    {/if}

    <div class="actions">
      {#if $selectedIds.size > 0}
        <button on:click={clearSelection}>Deselect all</button>
        <button class="danger" on:click={handleDelete}>
          Delete ({$selectedIds.size})
        </button>
      {/if}
      <button on:click={handleSync} disabled={syncing}>
        {syncing ? 'Syncing…' : 'Sync'}
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
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Status bar ─────────────────────────────────────────────────────── -->
  <div class="statusbar">
    <span class="statusbar-path">[{$libraryPath ?? ''}]</span>
    <span class="statusbar-sep">—</span>
    <!-- svelte-ignore a11y-invalid-attribute -->
    <a class="statusbar-link" href="#" on:click|preventDefault={selectLibraryPath}>Click here to change library folder…</a>
    {#if memMB}
      <span class="statusbar-mem">{memMB}</span>
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
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
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
    gap: 6px;
  }

  /* ── Column header ──────────────────────────────────────────────────────── */

  .header-row {
    display: flex;
    align-items: center;
    height: var(--header-height);
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
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
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Track rows ─────────────────────────────────────────────────────────── */

  .track-row {
    display: flex;
    align-items: center;
    padding: 0 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
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

  .col-check  { width: 28px; flex-shrink: 0; }
  .col-status { width: 20px; flex-shrink: 0; }
  .col-title  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 12px; }
  .col-artist { width: 180px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); padding-right: 12px; }
  .col-duration { width: 64px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  .col-size   { width: 72px; flex-shrink: 0; color: var(--fg-muted); text-align: right; font-variant-numeric: tabular-nums; }

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

  /* ── Empty state ────────────────────────────────────────────────────────── */

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 120px;
    color: var(--fg-muted);
    font-size: 13px;
  }

  /* ── Status bar ─────────────────────────────────────────────────────────── */

  .statusbar {
    height: 22px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .statusbar-path {
    font-size: 11px;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }

  .statusbar-sep {
    font-size: 11px;
    color: var(--fg-muted);
    flex-shrink: 0;
    margin: 0 6px;
  }

  .statusbar-link {
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    flex-shrink: 0;
    text-decoration: none;
  }

  .statusbar-link:hover {
    color: var(--fg);
    text-decoration: underline;
  }

  .statusbar-mem {
    margin-left: auto;
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
