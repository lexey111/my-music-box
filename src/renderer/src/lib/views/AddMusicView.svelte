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
  import logoSvg from '../../../../../assets/MyMusicBox-logo.svg?raw'
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
  let cookiesHelpOpen = false
  let previewedId: string | null = null

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
      searchLastQuery.set(pq)
      pendingQuery.set('')
      if (get(searchResults).length === 0) doSearch(pq)
    }
  })

  $: searchInput.set(query)
  $: $searchResults, (previewedId = null)

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

  // ── Title / Channel column resize ─────────────────────────────────────────

  let containerWidth = 0
  const FIXED_COLS = 276 // 24(n) + 60(dur) + 160(actions) + 24(row-pad) + 8(title-pr)
  const MIN_COL = 80

  let userTitleWidth: number | null = null
  $: available = Math.max(200, containerWidth - FIXED_COLS)
  $: maxTitle  = available - MIN_COL
  $: titleWidth = userTitleWidth !== null
    ? Math.max(MIN_COL, Math.min(userTitleWidth, maxTitle))
    : Math.round(available * 0.6)

  function startResize(e: MouseEvent): void {
    const startX = e.clientX
    const startW = titleWidth
    function onMove(ev: MouseEvent): void {
      userTitleWidth = Math.max(MIN_COL, Math.min(startW + (ev.clientX - startX), maxTitle))
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
</script>

<div class="add-music">

  <!-- ── Top island: search toolbar + results ──────────────────────────── -->
  <div class="island island-top" bind:clientWidth={containerWidth} style="--title-w: {titleWidth}px">
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
      <button class="search-btn" on:click={search} disabled={$searching || query.trim().length < 3}>
        {#if $searching}
          <Spinner />
        {:else}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {/if}
        {$searching ? 'Searching…' : 'Search'}
      </button>
      <label class="browser-label" title="Browser whose cookies yt-dlp will use to bypass bot detection">
        Cookies:
        <span class="select-wrap">
          <select
            value={$settings.cookiesBrowser}
            on:change={(e) => setSetting('cookiesBrowser', (e.target as HTMLSelectElement).value as CookiesBrowser)}
          >
            {#each browserOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <svg class="select-chevron" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true" pointer-events="none">
            <path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <button class="help-btn" on:click={() => (cookiesHelpOpen = true)} title="What is this?">?</button>
      </label>
    </div>

    <!-- ── Dependency error ───────────────────────────────────────────────── -->
    {#if $deps && (!$deps.ytdlp || !$deps.ffmpeg)}
      <div class="banner banner-error">
        Missing:
        {#if !$deps.ytdlp}<strong>yt-dlp</strong>{/if}
        {#if !$deps.ytdlp && !$deps.ffmpeg}, {/if}
        {#if !$deps.ffmpeg}<strong>ffmpeg</strong>{/if}
        — install with: <code>brew install {!$deps.ytdlp ? 'yt-dlp ' : ''}{!$deps.ffmpeg ? 'ffmpeg' : ''}</code>
      </div>
    {/if}

    <!-- ── Search error ────────────────────────────────────────────────────── -->
    {#if $searchError}
      <div class="banner banner-error">{$searchError}</div>
    {/if}

    <!-- ── Search results ─────────────────────────────────────────────────── -->
    {#if $searchResults.length > 0}
      <div class="results-label">Results for "{lastQuery}"</div>
      <div class="header-row">
        <span class="col-n">#</span>
        <span class="col-title">
          Title
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <span class="resize-handle" on:mousedown|stopPropagation={startResize}></span>
        </span>
        <span class="col-channel">Channel</span>
        <span class="col-dur">Duration</span>
        <span class="col-actions"></span>
      </div>
      <div class="results-list">
        {#each $searchResults as result, i (result.id)}
          {@const _url = result.webpage_url || result.url}
          {@const status = libraryUrls.has(_url) ? 'library' : activeUrls.has(_url) ? 'downloading' : 'available'}
          <div class="result-row" class:row-in-library={status === 'library'} class:row-downloading={status === 'downloading'} class:row-previewed={previewedId === result.id}>
            <span class="col-n">{i + 1}</span>
            <span class="col-title">
              <span class="title-text" title={result.title}>{result.title}</span>
              {#if status === 'library'}
                <span class="dup-badge">✓ In Library</span>
              {/if}
            </span>
            <span class="col-channel" title={result.uploader ?? ''}>{result.uploader ?? '—'}</span>
            <span class="col-dur">{formatDuration(result.duration)}</span>
            <span class="col-actions">
              <!-- svelte-ignore a11y-invalid-attribute -->
              <a class="preview-link" href="#" on:click|preventDefault={() => { previewedId = result.id; window.open(result.webpage_url) }} title="Open in browser">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                  <path d="M8 1h4v4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 1L6.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
                </svg>
              </a>
              <button class:primary={status === 'available'} class="dl-btn" on:click={() => startDownload(result)} disabled={status !== 'available'}>
                {#if status === 'downloading'}
                  <Spinner />
                {:else if status === 'available'}
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 2v8M5 7.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                {/if}
                {status === 'library' ? 'In Library' : status === 'downloading' ? 'Downloading…' : 'Download'}
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── Empty state ─────────────────────────────────────────────────────── -->
    {#if !$searchError && $searchResults.length === 0}
      <div class="empty" class:empty--logo={!$searching}>
        {#if $searching}
          Searching for "{query}"…
        {:else}
          <div class="empty-logo" aria-hidden="true">{@html logoSvg}</div>
          <p class="empty-hint">Search YouTube to find music to add to your library.</p>
        {/if}
      </div>
    {/if}
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

  {#if cookiesHelpOpen}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={() => (cookiesHelpOpen = false)} on:keydown={(e) => e.key === 'Escape' && (cookiesHelpOpen = false)}>
      <div class="modal-card" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
        <div class="modal-header">
          <h3>About Cookies</h3>
          <button class="modal-close" aria-label="Close" on:click={() => (cookiesHelpOpen = false)}>
            <svg width="10" height="10" viewBox="0 0 9 9" fill="none">
              <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body island">
          <p>YouTube limits downloads by bots. Passing your browser's cookies to yt-dlp lets it act as a logged-in user and bypass these restrictions.</p>
          <p><strong>Before searching or downloading:</strong> open the selected browser and make sure you are logged in to YouTube.</p>
          <p>Choose <em>No cookies</em> if you don't need this or if yt-dlp works without it for your use case.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" on:click={() => (cookiesHelpOpen = false)}>Close</button>
        </div>
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
    background: var(--bg-toolbar);
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

  .search-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
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

  .select-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .browser-label select {
    font-size: 11px;
    appearance: none;
    -webkit-appearance: none;
    padding-right: 20px;
  }

  .select-chevron {
    position: absolute;
    right: 6px;
    pointer-events: none;
    color: var(--fg-muted);
  }

  /* ── Results label (outside scroll) ─────────────────────────────────── */

  .results-label {
    padding: 10px 16px 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    background: var(--bg-toolbar);
    flex-shrink: 0;
  }

  /* ── Column header row ───────────────────────────────────────────────── */

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
    flex-shrink: 0;
  }

  /* ── Scrollable results container ────────────────────────────────────── */

  .results-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Individual result row ───────────────────────────────────────────── */

  .result-row {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid var(--separator);
    font-size: 13px;
  }

  .result-row:hover { background: var(--bg-hover); }
  .result-row.row-in-library { font-weight: 600; }
  .result-row.row-downloading { color: var(--fg-muted); }
  .result-row.row-previewed { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  /* ── Flex column widths (result rows + header) ───────────────────────── */

  .result-row .col-n,
  .header-row .col-n      { width: 24px; flex-shrink: 0; text-align: center; }

  .result-row .col-title,
  .header-row .col-title  { width: var(--title-w); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
  .header-row .col-title  { position: relative; }
  .result-row .col-title  { display: flex; align-items: center; gap: 6px; }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
  }
  .resize-handle:hover {
    background: var(--accent);
    opacity: 0.4;
  }

  .result-row .col-channel,
  .header-row .col-channel { flex: 1; min-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); }

  .result-row .col-dur,
  .header-row .col-dur    { width: 60px; flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; color: var(--fg-muted); }

  .result-row .col-actions,
  .header-row .col-actions { width: 160px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; white-space: nowrap; gap: 6px; }

  .dl-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 108px;
  }

  .result-row .title-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    flex-shrink: 0;
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
  .data-table .col-title { max-width: 0; width: 100%; }
  .col-channel  { width: 280px; min-width: 280px; }
  .col-dur      { width: 60px; text-align: right; }
  .col-actions  { width: 160px; white-space: nowrap; }
  .col-progress { width: 180px; }
  .col-status   { width: 110px; font-size: 12px; }
  .col-action   { width: 70px; }
  .col-error    { font-size: 12px; color: var(--error); }

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

  .preview-link:hover,
  .preview-link:focus-visible {
    color: var(--accent);
    opacity: 1;
    outline: none;
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

  .row-in-library .col-channel { color: var(--fg); }
  .row-done .progress-fill { background: #22c55e; }
  .row-error .col-error     { padding-left: 8px; }


  /* ── "In Library" badge ─────────────────────────────────────────────── */

  .dup-badge {
    display: inline-block;
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    background: #16a34a22;
    color: #16a34a;
    border: 1px solid #16a34a44;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .dup-badge {
    background: #22c55e1a;
    color: #4ade80;
    border-color: #22c55e33;
  }

  /* ── Help button ─────────────────────────────────────────────────────── */

  .help-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--button-border);
    background: none;
    color: var(--fg-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .help-btn:hover { background: var(--bg-hover); color: var(--fg); }

  /* ── Modal ───────────────────────────────────────────────────────────── */

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-card {
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-app);
    border-radius: 14px;
    padding: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.22);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px 0;
  }

  .modal-header h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }

  .modal-close {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
  .modal-close:hover { background: var(--bg-hover); color: var(--fg); }

  .modal-body {
    padding: 14px 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--fg);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .modal-body p { margin: 0; }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 4px 2px;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: var(--radius);
    padding: 5px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-primary:hover { opacity: 0.88; }

  /* ── Empty state ─────────────────────────────────────────────────────── */

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    font-size: 13px;
  }

  .empty--logo {
    flex-direction: column;
    gap: 16px;
    padding-bottom: 20px;
  }

  .empty-logo :global(svg) {
    max-width: 280px;
    width: 100%;
    height: auto;
    opacity: 0.85;
    display: block;
  }

  .empty-hint {
    font-size: 13px;
    color: var(--fg-muted);
    margin: 0;
  }
</style>
