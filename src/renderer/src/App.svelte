<script lang="ts">
  import { onMount } from 'svelte'
  import LibraryView from './lib/views/LibraryView.svelte'
  import { init, libraryPath, selectLibraryPath, settings } from './lib/stores/app'

  let ready = false

  onMount(async () => {
    await init()
    ready = true

    // Sync theme with system preference and the saved setting
    applyTheme($settings.theme)
  })

  // Re-apply whenever theme setting changes
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
  <LibraryView />
{/if}

<style>
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

  button {
    padding: 8px 20px;
    font-size: 13px;
  }
</style>
