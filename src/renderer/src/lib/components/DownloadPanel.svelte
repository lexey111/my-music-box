<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
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
    dismissJob,
    handleProgress,
    handleComplete,
    handleError
  } from '../stores/downloads'
  import { settings, setSetting } from '../stores/app'

  const dispatch = createEventDispatcher<{ trackAdded: void }>()

  const browserOptions: Array<{ value: CookiesBrowser; label: string }> = [
    { value: 'safari',   label: 'Safari' },
    { value: 'brave',    label: 'Brave' },
    { value: 'chrome',   label: 'Chrome' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'firefox',  label: 'Firefox' },
    { value: 'none',     label: 'No cookies' }
  ]

  let query = ''
  let cleanupFns: Array<() => void> = []

  onMount(async () => {
    await checkDeps()

    cleanupFns = [
      window.api.download.onProgress(handleProgress),
      window.api.download.onComplete((payload) => {
        handleComplete(payload)
        dispatch('trackAdded')
      }),
      window.api.download.onError(handleError)
    ]
  })

  onDestroy(() => {
    for (const fn of cleanupFns) fn()
  })

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') search()
  }

  function search(): void {
    if (!query.trim()) return
    doSearch(query.trim())
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

<div class="download-panel">
  <!-- ── Dependency error banner ───────────────────────────────────────── -->
  {#if $deps && (!$deps.ytdlp || !$deps.ffmpeg)}
    <div class="dep-banner">
      Missing dependencies:
      {#if !$deps.ytdlp}<strong>yt-dlp</strong>{/if}
      {#if !$deps.ytdlp && !$deps.ffmpeg}, {/if}
      {#if !$deps.ffmpeg}<strong>ffmpeg</strong>{/if}
      — install with:
      <code>brew install {!$deps.ytdlp ? 'yt-dlp ' : ''}{!$deps.ffmpeg ? 'ffmpeg' : ''}</code>
    </div>
  {/if}

  <!-- ── Search row ────────────────────────────────────────────────────── -->
  <div class="search-row">
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
    <label class="browser-label" title="Browser whose cookies yt-dlp will use">
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

  <!-- ── Search error ─────────────────────────────────────────────────── -->
  {#if $searchError}
    <div class="search-error">{$searchError}</div>
  {/if}

  <!-- ── Search results ────────────────────────────────────────────────── -->
  {#if $searchResults.length > 0}
    <div class="results">
      {#each $searchResults as result (result.id)}
        <div class="result-row">
          <span class="result-title" title={result.title}>{result.title}</span>
          <span class="result-artist">{result.uploader ?? '—'}</span>
          <span class="result-duration">{formatDuration(result.duration)}</span>
          <button
            class="download-btn"
            on:click={() => startDownload(result)}
          >
            Download
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── Active downloads ──────────────────────────────────────────────── -->
  {#if $activeJobs.size > 0}
    <div class="active-downloads">
      {#each [...$activeJobs.values()] as job (job.jobId)}
        {#if job.status === 'error'}
          <div class="job-row job-error">
            <span class="job-title" title={job.title}>{job.title}</span>
            <span class="job-error-msg">{job.error ?? 'Unknown error'}</span>
            <button class="cancel-btn" on:click={() => dismissJob(job.jobId)}>✕</button>
          </div>
        {:else}
          <div class="job-row" class:job-done={job.status === 'done'}>
            <span class="job-title" title={job.title}>{job.title}</span>
            <div class="job-progress-wrap">
              <div class="job-progress-bar" style="width: {job.progress}%"></div>
            </div>
            <span class="job-status">{statusLabel(job.status)}</span>
            {#if job.status === 'downloading' || job.status === 'processing'}
              <button class="cancel-btn" on:click={() => cancelDownload(job.jobId)}>Cancel</button>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .download-panel {
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    padding: 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Dep banner ──────────────────────────────────────────────────────── */

  .dep-banner {
    background: var(--error-bg);
    color: var(--error);
    border: 1px solid var(--error);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
  }

  .dep-banner code {
    font-family: var(--font-mono);
    background: rgba(0,0,0,0.08);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* ── Search error ────────────────────────────────────────────────────── */

  .search-error {
    font-size: 12px;
    color: var(--error);
    padding: 2px 0;
  }

  /* ── Search row ──────────────────────────────────────────────────────── */

  .search-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .search-row input {
    flex: 1;
    min-width: 0;
  }

  .browser-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .browser-label select {
    font-size: 11px;
  }

  /* ── Results ─────────────────────────────────────────────────────────── */

  .results {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }

  .result-row:last-child {
    border-bottom: none;
  }

  .result-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-artist {
    width: 140px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-muted);
  }

  .result-duration {
    width: 48px;
    flex-shrink: 0;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }

  .download-btn {
    flex-shrink: 0;
  }

  /* ── Active downloads ────────────────────────────────────────────────── */

  .active-downloads {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .job-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .job-title {
    width: 180px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job-progress-wrap {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }

  .job-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .job-done .job-progress-bar {
    background: #22c55e;
  }

  .job-status {
    width: 90px;
    flex-shrink: 0;
    color: var(--fg-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .job-error-msg {
    flex: 1;
    font-size: 11px;
    color: var(--error);
    min-width: 0;
    word-break: break-word;
  }

  .cancel-btn {
    flex-shrink: 0;
  }
</style>
