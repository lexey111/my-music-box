<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import LibraryView from './lib/views/LibraryView.svelte'
  import AddMusicView from './lib/views/AddMusicView.svelte'
  import SettingsView from './lib/views/SettingsView.svelte'
  import { init, libraryPath, selectLibraryPath, settings, loadTracks, tracks, activeTab } from './lib/stores/app'
  import { handleProgress, handleComplete, handleError } from './lib/stores/downloads'

  let ready = false
  let memMB = ''
  let memTimer: ReturnType<typeof setInterval>

  onMount(async () => {
    await init()
    ready = true
    applyTheme($settings.theme)

    window.api.download.onProgress(handleProgress)
    window.api.download.onComplete((payload) => {
      handleComplete(payload)
      loadTracks()
    })
    window.api.download.onError(handleError)

    updateMem()
    memTimer = setInterval(updateMem, 3000)
  })

  onDestroy(() => clearInterval(memTimer))

  async function updateMem(): Promise<void> {
    const mb = await window.api.app.getMemoryMB()
    memMB = `${mb} MB`
  }

  $: applyTheme($settings.theme)

  $: totalDuration = $tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0)

  function formatTotalDuration(s: number): string {
    if (s === 0) return ''
    s = Math.round(s)

    // Under 1 hour: exact M:SS
    if (s < 3600) {
      const m = Math.floor(s / 60)
      const sec = s % 60
      return `${m}:${String(sec).padStart(2, '0')}`
    }

    const h = Math.floor(s / 3600)
    const remSec = s % 3600
    const remMin = Math.floor(remSec / 60)

    // Under 1 day: fuzzy hours
    if (s < 86400) {
      if (remSec >= 3540) return `almost ${h + 1} hours`
      if (remSec <= 180)  return `about ${h} hour${h !== 1 ? 's' : ''}`
      if (remMin >= 27 && remMin <= 33) return `${h === 1 ? 'one' : h} and a half hours`
      return `${h}h ${remMin}m`
    }

    // Under 1 week: days + hours
    if (s < 604800) {
      const d = Math.floor(s / 86400)
      const rh = Math.floor((s % 86400) / 3600)
      return `${d} day${d !== 1 ? 's' : ''}${rh > 0 ? ` and ${rh} hour${rh !== 1 ? 's' : ''}` : ''}`
    }

    // Weeks
    const w = Math.floor(s / 604800)
    const d = Math.floor((s % 604800) / 86400)
    const rh = Math.floor((s % 86400) / 3600)
    let result = `${w} week${w !== 1 ? 's' : ''}`
    if (d > 0) result += `, ${d} day${d !== 1 ? 's' : ''}`
    if (rh > 0) result += ` and ${rh} hour${rh !== 1 ? 's' : ''}`
    return result
  }

  function applyTheme(theme: AppSettings['theme']): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }
</script>

{#if !ready}
  <!-- intentionally blank while loading settings (~one frame) -->
{:else if !$libraryPath}
  <div class="setup">
    <div class="drag-region"></div>
    <div class="setup-card">
      <h1>My Music Box</h1>
      <p>Choose a folder to store your music library.<br />A <code>library.db</code> and a <code>tracks/</code> sub-folder will be created there.</p>
      <button class="primary" on:click={selectLibraryPath}>
        Choose Library Folder
      </button>
    </div>
  </div>
{:else}
  <div class="app-shell">
    <!-- ── Tab bar (macOS drag region) ──────────────────────────────────── -->
    <div class="tab-bar">
      <button
        class="tab"
        class:active={$activeTab === 'library'}
        on:click={() => ($activeTab = 'library')}
      >Library {#if $tracks.length > 0}<span class="count">{$tracks.length}</span>{/if}</button>
      <button
        class="tab"
        class:active={$activeTab === 'addMusic'}
        on:click={() => ($activeTab = 'addMusic')}
      >Add Music</button>
      <button
        class="gear"
        class:active={$activeTab === 'settings'}
        title="Settings"
        on:click={() => ($activeTab = $activeTab === 'settings' ? 'library' : 'settings')}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- ── View ──────────────────────────────────────────────────────────── -->
    {#if $activeTab === 'library'}
      <LibraryView />
    {:else if $activeTab === 'addMusic'}
      <AddMusicView />
    {:else}
      <SettingsView />
    {/if}

    <!-- ── Status bar ────────────────────────────────────────────────────── -->
    <div class="statusbar">
      <span class="statusbar-path">{$libraryPath ?? ''}</span>
      <span class="statusbar-sep"></span>
      <!-- svelte-ignore a11y-invalid-attribute -->
      <a class="statusbar-link" href="#" on:click|preventDefault={() => ($activeTab = 'settings')}>Change…</a>
      <span class="statusbar-right">
        {#if $tracks.length > 0}
          <span class="statusbar-stat">{$tracks.length} tracks</span>
          {#if totalDuration > 0}
            <span class="statusbar-sep"></span>
            <span class="statusbar-stat">{formatTotalDuration(totalDuration)}</span>
          {/if}
          {#if memMB}
            <span class="statusbar-sep"></span>
          {/if}
        {/if}
        {#if memMB}
          <span class="statusbar-stat">{memMB}</span>
        {/if}
      </span>
    </div>
  </div>
{/if}

<style>
  /* ── Setup screen ───────────────────────────────────────────────────── */

  .setup {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .drag-region {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 36px;
    -webkit-app-region: drag;
  }

  .setup-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    max-width: 360px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  p {
    color: var(--fg-muted);
    line-height: 1.6;
  }

  code {
    font-family: var(--font-mono);
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* ── App shell ──────────────────────────────────────────────────────── */

  .app-shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Tab bar ────────────────────────────────────────────────────────── */

  .tab-bar {
    position: relative;
    display: flex;
    align-items: stretch;
    justify-content: center;
    height: var(--toolbar-height);
    padding: 0 80px; /* clear macOS traffic lights symmetrically */
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    -webkit-app-region: drag;
    flex-shrink: 0;
  }

  .tab {
    -webkit-app-region: no-drag;
    -webkit-appearance: none;
    appearance: none;
    border-radius: 0;
    padding: 0 18px;
    font-size: 13px;
    font-weight: 500;
    color: var(--fg-muted);
    cursor: pointer;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px; /* overlap the tab-bar bottom border */
    transition: color 0.1s;
  }

  .tab:hover {
    color: var(--fg);
  }

  .tab.active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }

  .gear {
    -webkit-app-region: no-drag;
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .gear:hover {
    color: var(--fg);
    background: var(--bg-hover);
  }

  .gear.active {
    color: var(--accent);
    background: var(--bg-hover);
  }

  /* ── Status bar ─────────────────────────────────────────────────────── */

  .statusbar {
    height: 22px;
    padding: 0 12px;
    display: flex;
    align-items: stretch;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
  }

  .statusbar-path {
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
    display: flex;
    align-items: center;
    padding: 0 6px 0 0;
  }

  .statusbar-sep {
    flex-shrink: 0;
    width: 1px;
    align-self: stretch;
    background: var(--border);
    margin: 3px 6px;
  }

  .statusbar-link {
    color: var(--fg-muted);
    text-decoration: none;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 6px;
  }

  .statusbar-link:hover {
    color: var(--fg);
    text-decoration: underline;
  }

  .statusbar-right {
    margin-left: auto;
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .statusbar-stat {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    font-variant-numeric: tabular-nums;
    padding: 0 6px;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--bg-tertiary, var(--border));
    color: var(--fg-muted);
    font-size: 11px;
    font-weight: 500;
    margin-left: 5px;
    vertical-align: middle;
  }
</style>
