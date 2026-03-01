<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { slide } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import {
    deps,
    searchResults,
    searchError,
    searching,
    activeJobs,
    pendingQuery,
    searchInput,
    searchLastQuery,
    checkDeps,
    doSearch,
    startDownload,
    cancelDownload,
    dismissJob
  } from '../stores/downloads'
  import { settings, setSetting, tracks } from '../stores/app'
  import Spinner from '../components/Spinner.svelte'

  const browserOptions: Array<{ value: CookiesBrowser; label: string }> = [
    { value: 'safari',   label: 'Safari' },
    { value: 'brave',    label: 'Brave' },
    { value: 'chrome',   label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'firefox',  label: 'Firefox' },
    { value: 'none',     label: 'No cookies' }
  ]

  let query = get(searchInput)
  let lastQuery = get(searchLastQuery)

  $: libraryUrls = new Set($tracks.filter((t) => t.status === 'ok').map((t) => t.source_url).filter(Boolean) as string[])

  $: activeUrls = new Set(
    [...$activeJobs.values()]
      .filter((j) => j.status === 'downloading' || j.status === 'processing')
      .map((j) => j.url)
  )

  onMount(() => {
    checkDeps()
    const pq = get(pendingQuery)
    if (pq) {
      query = pq
      lastQuery = pq
      pendingQuery.set('')
      if (get(searchResults).length === 0) doSearch(pq)
    }
  })

  $: searchInput.set(query)

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') search()
  }

  function search(): void {
    if (query.trim().length >= 3) {
      lastQuery = query.trim()
      searchLastQuery.set(lastQuery)
      doSearch(lastQuery)
    }
  }

  function clearSearch(): void {
    query = ''
    searchResults.set([])
    searchError.set(null)
  }

  function formatDuration(seconds: number | null): string {
    if (seconds == null) return '—'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function statusLabel(status: JobStatus): string {
    switch (status) {
      case 'downloading': return 'Downloading…'
      case 'processing':  return 'Processing…'
      case 'done':        return 'Done'
      case 'error':       return 'Error'
      case 'cancelled':   return 'Cancelled'
    }
  }
</script>

<div class="add-music">

  <!-- ── Top island: search toolbar + results ──────────────────────────── -->
  <div class="island island-top">
    <div class="toolbar">
      <div class="search-input-wrap">
        <svg class="yt-icon" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
          <rect width="14" height="10" rx="2" fill="#FF0000"/>
          <path d="M5.5 3L9.5 5L5.5 7Z" fill="white"/>
        </svg>
        <input
          type="text"
          placeholder="Search YouTube…"
          bind:value={query}
          on:keydown={handleKeydown}
          disabled={$searching}
        />
        {#if query}
          <button class="clear-btn" on:click={clearSearch} tabindex="-1" title="Clear">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
      </div>
      <button on:click={search} disabled={$searching || query.trim().length < 3}>
        {#if $searching}<Spinner />{/if}
        {$searching ? 'Searching…' : 'Search'}
      </button>
      <label class="browser-label" title="Browser whose cookies yt-dlp will use to bypass bot detection">
        Cookies:
        <select
          value={$settings.cookiesBrowser}
          on:change={(e) => setSetting('cookiesBrowser', (e.target as HTMLSelectElement).value as CookiesBrowser)}
        >
          {#each browserOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="search-body">
      <!-- ── Dependency error ──────────────────────────────────────────── -->
      {#if $deps && (!$deps.ytdlp || !$deps.ffmpeg)}
        <div class="banner banner-error">
          Missing:
          {#if !$deps.ytdlp}<strong>yt-dlp</strong>{/if}
          {#if !$deps.ytdlp && !$deps.ffmpeg}, {/if}
          {#if !$deps.ffmpeg}<strong>ffmpeg</strong>{/if}
          — install with: <code>brew install {!$deps.ytdlp ? 'yt-dlp ' : ''}{!$deps.ffmpeg ? 'ffmpeg' : ''}</code>
        </div>
      {/if}

      <!-- ── Search error ──────────────────────────────────────────────── -->
      {#if $searchError}
        <div class="banner banner-error">{$searchError}</div>
      {/if}

      <!-- ── Search results ────────────────────────────────────────────── -->
      {#if $searchResults.length > 0}
        <div class="results-section">
          <h2>Results for "{lastQuery}"</h2>
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-n">#</th>
                <th class="col-title">Title</th>
                <th class="col-channel">Channel</th>
                <th class="col-dur">Duration</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each $searchResults as result, i (result.id)}
                {@const _url = result.webpage_url || result.url}
                {@const status = libraryUrls.has(_url) ? 'library' : activeUrls.has(_url) ? 'downloading' : 'available'}
                <tr class:row-in-library={status === 'library'} class:row-downloading={status === 'downloading'}>
                  <td class="col-n muted">{i + 1}</td>
                  <td class="col-title">
                    <span class="title-text" title={result.title}>{result.title}</span>
                  </td>
                  <td class="col-channel muted" title={result.uploader ?? ''}>{result.uploader ?? '—'}</td>
                  <td class="col-dur muted tabular">{formatDuration(result.duration)}</td>
                  <td class="col-actions">
                    <!-- svelte-ignore a11y-invalid-attribute -->
                    <a class="preview-link" href="#" on:click|preventDefault={() => window.open(result.webpage_url)} title="Open in browser">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                        <path d="M8 1h4v4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M12 1L6.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                      </svg>
                    </a>
                    <button on:click={() => startDownload(result)} disabled={status !== 'available'}>
                      {#if status === 'downloading'}<Spinner />{/if}
                      {status === 'library' ? 'In Library' : status === 'downloading' ? 'Downloading…' : 'Download'}
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- ── Empty state ────────────────────────────────────────────────── -->
      {#if !$searchError && $searchResults.length === 0}
        <div class="empty">
          {#if $searching}
            Searching for "{query}"…
          {:else}
            Search YouTube to find music to add to your library.
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Bottom island: download queue (slides in/out) ─────────────────── -->
  {#if $activeJobs.size > 0}
    <div
      class="island island-queue"
      transition:slide={{ duration: 220, easing: cubicOut }}
    >
      <div class="queue-header">
        <h2>Download Queue</h2>
      </div>
      <div class="queue-body">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-title">Title</th>
              <th class="col-progress">Progress</th>
              <th class="col-status">Status</th>
              <th class="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {#each [...$activeJobs.values()] as job (job.jobId)}
              {#if job.status === 'error'}
                <tr class="row-error">
                  <td class="col-title">
                    <span class="title-text" title={job.title}>{job.title}</span>
                  </td>
                  <td class="col-error" colspan="2">{job.error ?? 'Unknown error'}</td>
                  <td class="col-action">
                    <button class="btn-dismiss" on:click={() => dismissJob(job.jobId)}>Dismiss</button>
                  </td>
                </tr>
              {:else}
                <tr class:row-done={job.status === 'done'}>
                  <td class="col-title">
                    <span class="title-text" title={job.title}>{job.title}</span>
                  </td>
                  <td class="col-progress">
                    <div class="progress-track">
                      <div class="progress-fill" style="width: {job.progress}%"></div>
                    </div>
                  </td>
                  <td class="col-status muted tabular">{statusLabel(job.status)}</td>
                  <td class="col-action">
                    {#if job.status === 'downloading' || job.status === 'processing'}
                      <button on:click={() => cancelDownload(job.jobId)}>Cancel</button>
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

</div>

<style>
  /* ── Canvas ──────────────────────────────────────────────────────────── */

  .add-music {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }

  /* ── Islands ─────────────────────────────────────────────────────────── */

  .island {
    border-radius: 10px;
    background: var(--bg);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
    overflow: hidden;
  }

  .island-top {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .island-queue {
    flex-shrink: 0;
    max-height: 240px;
    display: flex;
    flex-direction: column;
  }

  /* ── Toolbar (inside top island) ─────────────────────────────────────── */

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    height: var(--toolbar-height);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .search-input-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    max-width: 380px;
    display: flex;
    align-items: center;
  }

  .search-input-wrap input {
    width: 100%;
    padding-left: 30px;
    padding-right: 26px;
  }

  .yt-icon {
    position: absolute;
    left: 9px;
    pointer-events: none;
    flex-shrink: 0;
  }

  .clear-btn {
    position: absolute;
    right: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .clear-btn:hover {
    background: var(--bg-hover);
    color: var(--fg);
  }

  .browser-label {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
  }

  .browser-label select {
    font-size: 11px;
  }

  /* ── Search body (scrollable) ────────────────────────────────────────── */

  .search-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* ── Results section ─────────────────────────────────────────────────── */

  .results-section {
    display: flex;
    flex-direction: column;
  }

  .results-section h2 {
    padding: 12px 16px 8px;
  }

  /* ── Queue header ────────────────────────────────────────────────────── */

  .queue-header {
    padding: 10px 16px 6px;
    flex-shrink: 0;
  }

  /* ── Queue body (scrollable) ─────────────────────────────────────────── */

  .queue-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 0 8px;
  }

  /* ── Banners ─────────────────────────────────────────────────────────── */

  .banner {
    margin: 12px 16px 0;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
  }

  .banner-error {
    background: var(--error-bg);
    color: var(--error);
    border: 1px solid var(--error);
  }

  .banner-error code {
    font-family: var(--font-mono);
    background: rgba(0, 0, 0, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* ── Section headings ────────────────────────────────────────────────── */

  h2 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    margin: 0;
  }

  /* ── Tables ──────────────────────────────────────────────────────────── */

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .data-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 8px 6px;
    border-bottom: 1px solid var(--border);
  }

  .data-table td {
    padding: 7px 8px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .data-table tbody tr:hover td {
    background: var(--bg-hover);
  }

  .muted { color: var(--fg-muted); }
  .tabular { font-variant-numeric: tabular-nums; }

  /* ── Column widths ───────────────────────────────────────────────────── */

  .col-n        { width: 24px; }
  .data-table .col-n { padding-left: 24px; text-align: center; }
  .col-title    { max-width: 0; width: 100%; }
  .col-channel  { width: 280px; min-width: 280px; }
  .col-dur      { width: 60px; text-align: right; }
  .col-actions  { width: 160px; white-space: nowrap; }
  .col-progress { width: 180px; }
  .col-status   { width: 110px; font-size: 12px; }
  .col-action   { width: 70px; }
  .col-error    { font-size: 12px; color: var(--error); }

  .title-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Preview link ────────────────────────────────────────────────────── */

  .preview-link {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    color: var(--fg-muted);
    text-decoration: none;
    margin-right: 8px;
    opacity: 0.7;
    transition: opacity 0.1s, color 0.1s;
  }

  .preview-link:hover {
    color: var(--accent);
    opacity: 1;
  }

  /* ── Progress bar ────────────────────────────────────────────────────── */

  .progress-track {
    height: 5px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .row-in-library td { font-weight: 600; }
  .row-in-library .muted { color: var(--fg); }
  .row-downloading td { color: var(--fg-muted); }
  .row-done .progress-fill { background: #22c55e; }
  .row-error .col-error     { padding-left: 8px; }

  /* ── Dismiss button ──────────────────────────────────────────────────── */

  .btn-dismiss {
    font-size: 11px;
    padding: 2px 8px;
  }

  /* ── Empty state ─────────────────────────────────────────────────────── */

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    font-size: 13px;
  }
</style>
