<script lang="ts">
  import { settings, setSetting, selectLibraryPath } from '../stores/app'
</script>

<div class="settings">
  <div class="content">

    <!-- ── Appearance ──────────────────────────────────────────────────── -->
    <section>
      <h2>Appearance</h2>
      <div class="row">
        <span class="label">Theme</span>
        <div class="segment">
          {#each (['system', 'light', 'dark'] as AppSettings['theme'][]) as opt}
            <button
              class:active={$settings.theme === opt}
              on:click={() => setSetting('theme', opt)}
            >{opt[0].toUpperCase() + opt.slice(1)}</button>
          {/each}
        </div>
      </div>
    </section>

    <!-- ── Library ────────────────────────────────────────────────────── -->
    <section>
      <h2>Library</h2>
      <div class="row">
        <span class="label">Location</span>
        <span class="path muted" title={$settings.libraryPath ?? ''}>{$settings.libraryPath ?? '—'}</span>
        <button on:click={selectLibraryPath}>Change…</button>
      </div>
    </section>

    <!-- ── Playback ───────────────────────────────────────────────────── -->
    <section>
      <h2>Playback</h2>
      <div class="row">
        <span class="label">Crossfade</span>
        <label class="toggle">
          <input
            type="checkbox"
            checked={$settings.crossfade}
            on:change={(e) => setSetting('crossfade', (e.target as HTMLInputElement).checked)}
          />
          <span class="track"><span class="thumb"></span></span>
        </label>
      </div>
      {#if $settings.crossfade}
        <div class="row">
          <span class="label">Duration</span>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={$settings.crossfadeDuration ?? 3}
            on:input={(e) => setSetting('crossfadeDuration', Number((e.target as HTMLInputElement).value))}
          />
          <span class="range-value">{$settings.crossfadeDuration ?? 3}s</span>
        </div>
      {/if}
    </section>

  </div>
</div>

<style>
  .settings {
    flex: 1;
    overflow-y: auto;
  }

  .content {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h2 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    margin-bottom: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .label {
    font-size: 13px;
    min-width: 90px;
    flex-shrink: 0;
  }

  .path {
    flex: 1;
    font-size: 12px;
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .muted { color: var(--fg-muted); }

  /* ── Segmented control ───────────────────────────────────────────────── */

  .segment {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .segment button {
    border: none;
    border-radius: 0;
    border-right: 1px solid var(--border);
    padding: 4px 14px;
    font-size: 12px;
    background: var(--bg);
    color: var(--fg-muted);
  }

  .segment button:last-child {
    border-right: none;
  }

  .segment button.active {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .segment button:not(.active):hover {
    background: var(--bg-hover);
    color: var(--fg);
  }

  /* ── Toggle switch ───────────────────────────────────────────────────── */

  .toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .track {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--border);
    border-radius: 10px;
    transition: background 0.15s;
  }

  .toggle input:checked + .track {
    background: var(--accent);
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.15s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  .toggle input:checked + .track .thumb {
    transform: translateX(16px);
  }

  /* ── Range ───────────────────────────────────────────────────────────── */

  input[type='range'] {
    flex: 1;
    accent-color: var(--accent);
  }

  .range-value {
    font-size: 12px;
    color: var(--fg-muted);
    min-width: 28px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
