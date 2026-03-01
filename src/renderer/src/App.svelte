<script lang="ts">
  import { onMount } from 'svelte'
  import LibraryView from './lib/views/LibraryView.svelte'
  import AddMusicView from './lib/views/AddMusicView.svelte'
  import { init, libraryPath, selectLibraryPath, settings, loadTracks, tracks } from './lib/stores/app'
  import { handleProgress, handleComplete, handleError } from './lib/stores/downloads'

  let ready = false
  let tab: 'library' | 'addMusic' = 'library'

  onMount(async () => {
    await init()
    ready = true
    applyTheme($settings.theme)

    // Register download listeners once for the app lifetime so progress is
    // tracked even when the user is on the Library tab.
    window.api.download.onProgress(handleProgress)
    window.api.download.onComplete((payload) => {
      handleComplete(payload)
      loadTracks()
    })
    window.api.download.onError(handleError)
  })

  $: applyTheme($settings.theme)

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
        class:active={tab === 'library'}
        on:click={() => (tab = 'library')}
      >Library {#if $tracks.length > 0}<span class="count">{$tracks.length}</span>{/if}</button>
      <button
        class="tab"
        class:active={tab === 'addMusic'}
        on:click={() => (tab = 'addMusic')}
      >Add Music</button>
    </div>

    <!-- ── View ──────────────────────────────────────────────────────────── -->
    {#if tab === 'library'}
      <LibraryView />
    {:else}
      <AddMusicView />
    {/if}
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
