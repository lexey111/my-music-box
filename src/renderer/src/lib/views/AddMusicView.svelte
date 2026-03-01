<script lang="ts">
  import { onMount } from 'svelte'
  import {
    deps,
    searchResults,
    searchError,
    searching,
    activeJobs,
    checkDeps,
    doSearch,
    startDownload,
    cancelDownload,
    dismissJob
  } from '../stores/downloads'
  import { settings, setSetting } from '../stores/app'

  const browserOptions: Array<{ value: CookiesBrowser; label: string }> = [
    { value: 'safari',   label: 'Safari' },
    { value: 'brave',    label: 'Brave' },
    { value: 'chrome',   label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'firefox',  label: 'Firefox' },
    { value: 'none',     label: 'No cookies' }
  ]

  let query = ''

  onMount(() => { checkDeps() })

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') search()
  }

  function search(): void {
    if (query.trim()) doSearch(query.trim())
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
  <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
  <div class="toolbar">
    <input
      type="text"
      placeholder="Search YouTube…"
      bind:value={query}
      on:keydown={handleKeydown}
      disabled={$searching}
    />
    <button on:click={search} disabled={$searching || !query.trim()}>
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

  <div class="content">
    <!-- ── Dependency error ────────────────────────────────────────────── -->
    {#if $deps && (!$deps.ytdlp || !$deps.ffmpeg)}
      <div class="banner banner-error">
        Missing:
        {#if !$deps.ytdlp}<strong>yt-dlp</strong>{/if}
        {#if !$deps.ytdlp && !$deps.ffmpeg}, {/if}
        {#if !$deps.ffmpeg}<strong>ffmpeg</strong>{/if}
        — install with: <code>brew install {!$deps.ytdlp ? 'yt-dlp ' : ''}{!$deps.ffmpeg ? 'ffmpeg' : ''}</code>
      </div>
    {/if}

    <!-- ── Search error ─────────────────────────────────────────────────── -->
    {#if $searchError}
      <div class="banner banner-error">{$searchError}</div>
    {/if}

    <!-- ── Search results ───────────────────────────────────────────────── -->
    {#if $searchResults.length > 0}
      <section>
        <h2>Search Results</h2>
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
              <tr>
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
                  <button on:click={() => startDownload(result)}>Download</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <!-- ── Download queue ───────────────────────────────────────────────── -->
    {#if $activeJobs.size > 0}
      <section>
        <h2>Download Queue</h2>
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
      </section>
    {/if}

    <!-- ── Empty state ───────────────────────────────────────────────────── -->
    {#if !$searchError && $searchResults.length === 0 && $activeJobs.size === 0}
      <div class="empty">Search YouTube to find music to add to your library.</div>
    {/if}
  </div>
</div>

<style>
  .add-music {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */

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

  .toolbar input {
    flex: 1;
    min-width: 0;
    max-width: 380px;
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

  /* ── Scrollable content area ────────────────────────────────────────── */

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Banners ────────────────────────────────────────────────────────── */

  .banner {
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

  /* ── Sections ───────────────────────────────────────────────────────── */

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    margin: 0;
  }

  /* ── Tables ─────────────────────────────────────────────────────────── */

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

  /* ── Column widths ──────────────────────────────────────────────────── */

  .col-n        { width: 24px; text-align: center; }
  .col-title    { max-width: 0; width: 100%; } /* flex-like stretch */
  .col-channel  { width: 160px; }
  .col-dur      { width: 60px; }
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

  /* ── Preview link ───────────────────────────────────────────────────── */

  .preview-link {
    display: inline-flex;
    align-items: center;
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

  /* ── Progress bar ───────────────────────────────────────────────────── */

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

  .row-done .progress-fill { background: #22c55e; }
  .row-error .col-error     { padding-left: 8px; }

  /* ── Dismiss button ─────────────────────────────────────────────────── */

  .btn-dismiss {
    font-size: 11px;
    padding: 2px 8px;
  }

  /* ── Empty state ────────────────────────────────────────────────────── */

  .empty {
    text-align: center;
    color: var(--fg-muted);
    font-size: 13px;
    margin-top: 48px;
  }
</style>
