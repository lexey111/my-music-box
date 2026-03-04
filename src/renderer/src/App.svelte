<script lang="ts">
    import {onMount} from 'svelte'
    function slideIn(_node: Element, { y = -1, duration = 100 }: { y?: number; duration?: number } = {}) {
        return {
            duration,
            css: (t: number) => `transform: translateY(${(1 - t) * y}px)`
        }
    }
    import LibraryView from './lib/views/LibraryView.svelte'
    import AddMusicView from './lib/views/AddMusicView.svelte'
    import ImportMusicView from './lib/views/ImportMusicView.svelte'
    import SettingsView from './lib/views/SettingsView.svelte'
    import {init, libraryPath, libraryValid, initLibrary, selectLibraryPath, settings, loadTracks, tracks, activeTab, importScanning, activeImportJob, importJobResult} from './lib/stores/app'
    import {handleProgress, handleComplete, handleError, activeJobs} from './lib/stores/downloads'
    import PlayerIsland from './lib/components/PlayerIsland.svelte'

    let isMini = false

    async function toggleMiniMode(): Promise<void> {
        if (!isMini) {
            isMini = true                             // show mini UI during entry animation
            await window.api.player.setMiniMode(true)
        } else {
            await window.api.player.setMiniMode(false) // keep mini UI during exit animation
            isMini = false
        }
    }

    let ready = false

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

        window.api.import.onProgress((p) => {
            activeImportJob.update(j => {
                if (!j || j.jobId !== p.jobId) return j
                const items = j.items.map((item, i) =>
                    i === p.fileIndex ? { ...item, status: 'processing' as const } : item
                )
                return { ...j, current: p.fileIndex + 1, total: p.total, filename: p.filename, items }
            })
        })

        window.api.import.onFileComplete((p) => {
            tracks.update(t => [...t, p.track])
            activeImportJob.update(j => {
                if (!j || j.jobId !== p.jobId) return j
                const items = j.items.map((item, i) =>
                    i === p.fileIndex ? { ...item, status: 'done' as const } : item
                )
                return { ...j, items }
            })
        })

        window.api.import.onFileError((p) => {
            activeImportJob.update(j => {
                if (!j || j.jobId !== p.jobId) return j
                const items = j.items.map((item, i) =>
                    i === p.fileIndex ? { ...item, status: 'error' as const } : item
                )
                return { ...j, items }
            })
        })

        window.api.import.onDone((p) => {
            activeImportJob.set(null)
            importJobResult.set({ imported: p.imported, errors: p.errors })
            loadTracks()
        })
    })

    $: applyTheme($settings.theme)

    $: totalDuration = $tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0)
    $: totalSize = $tracks.reduce((sum, t) => sum + (t.file_size ?? 0), 0)

    function formatSize(bytes: number): string {
        if (bytes === 0) return ''
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

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
            if (remSec <= 180) return `about ${h} hour${h !== 1 ? 's' : ''}`
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
            <p>Choose a folder to store your music library.<br/>A <code>library.db</code> and a <code>tracks/</code>
                sub-folder will be created there.</p>
            <button class="primary" on:click={selectLibraryPath}>
                Choose Library Folder
            </button>
        </div>
    </div>
{:else if $libraryPath && !$libraryValid}
    <div class="setup">
        <div class="drag-region"></div>
        <div class="setup-card">
            <h1>My Music Box</h1>
            <p>The selected folder doesn't have a music library yet.</p>
            <p class="path-display">{$libraryPath}</p>
            <p>Allow the app to create a <code>library.db</code> and a <code>tracks/</code> folder there?</p>
            <div class="permit-actions">
                <button class="primary" on:click={initLibrary}>Permit</button>
                <button on:click={selectLibraryPath}>Choose Another Folder…</button>
            </div>
        </div>
    </div>
{:else if isMini}
    <div class="mini-shell">
        <PlayerIsland {isMini} onToggleMini={toggleMiniMode}/>
    </div>
{:else}
    <div class="app-shell">
        <!-- ── Tab bar (macOS drag region) ──────────────────────────────────── -->
        <div class="tab-bar">
            <button
                    class="tab"
                    class:active={$activeTab === 'library'}
                    on:click={() => ($activeTab = 'library')}
            >Library
            </button>
            <button
                    class="tab"
                    class:active={$activeTab === 'addMusic'}
                    on:click={() => ($activeTab = 'addMusic')}
            >Find Music
            </button>
            <button
                    class="tab"
                    class:active={$activeTab === 'importMusic'}
                    on:click={() => ($activeTab = 'importMusic')}
            >Import Music
            </button>
            <button
                    class="gear"
                    class:active={$activeTab === 'settings'}
                    title="Settings"
                    disabled={!!$activeImportJob}
                    on:click={() => ($activeTab = $activeTab === 'settings' ? 'library' : 'settings')}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/>
                    <line x1="9" y1="8" x2="15" y2="8"/>
                    <line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
            </button>
        </div>

        <!-- ── Content area ─────────────────────────────────────────────────── -->
        <div class="content-area">
            {#key $activeTab}
                <div class="tab-panel" in:slideIn>
                    {#if $activeTab === 'addMusic'}
                        <AddMusicView/>
                    {:else if $activeTab === 'importMusic'}
                        <div class="content-island">
                            <ImportMusicView/>
                        </div>
                    {:else}
                        <div class="content-island">
                            {#if $activeTab === 'library'}
                                <LibraryView/>
                            {:else}
                                <SettingsView/>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/key}

            {#if $activeTab === 'library' && $tracks.length > 0}
                <PlayerIsland {isMini} onToggleMini={toggleMiniMode}/>
            {/if}

            <!-- ── Status bar ──────────────────────────────────────────────────── -->
            <div class="statusbar">
                <span class="statusbar-path">{$libraryPath ?? ''}</span>&middot;
                <!-- svelte-ignore a11y-invalid-attribute -->
                <a class="statusbar-link" class:disabled={!!$activeImportJob} href="#" on:click|preventDefault={() => { if (!$activeImportJob) selectLibraryPath() }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                        <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                        <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
                    </svg>
                    Change…
                </a>
                {#if [...$activeJobs.values()].some(j => j.status === 'downloading') || $importScanning || $activeImportJob}<span class="statusbar-spinner" aria-label="Working"></span>{/if}
                {#if $activeImportJob}
                    <span class="statusbar-import">Importing {$activeImportJob.current} / {$activeImportJob.total}</span>
                {/if}
                <span class="statusbar-right">
        {#if $tracks.length > 0}
          <span class="statusbar-stat">{$tracks.length} tracks</span>
            {#if totalDuration > 0}
                <span class="statusbar-sep"></span>
                <span class="statusbar-stat">{formatTotalDuration(totalDuration)}</span>
            {/if}
            {#if totalSize > 0}
                <span class="statusbar-sep"></span>
                <span class="statusbar-stat">{formatSize(totalSize)}</span>
            {/if}
        {/if}
      </span>
            </div>
        </div><!-- end content-area -->
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

    .path-display {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-muted);
        background: var(--bg-secondary);
        padding: 6px 10px;
        border-radius: var(--radius);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin: 0;
    }

    .permit-actions {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
    }

    /* ── Mini shell ─────────────────────────────────────────────────────── */

    .mini-shell {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-app);
    }

    /* ── App shell ──────────────────────────────────────────────────────── */

    .app-shell {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-app);
    }

    /* ── Tab bar ────────────────────────────────────────────────────────── */

    .tab-bar {
        position: relative;
        display: flex;
        align-items: stretch;
        justify-content: center;
        height: var(--toolbar-height);
        padding: 0 80px;
        background: var(--bg-app);
        -webkit-app-region: drag;
        flex-shrink: 0;
    }

    /* ── Content area (padded canvas below tab bar) ──────────────────────── */

    .content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 0 8px 8px;
        overflow: hidden;
    }

    /* ── Tab panel (fade wrapper) ────────────────────────────────────────── */

    .tab-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
    }

    /* ── Content island ──────────────────────────────────────────────────── */

    .content-island {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 10px;
        background: var(--bg);
    }

    .tab {
        -webkit-app-region: no-drag;
        -webkit-appearance: none;
        appearance: none;
        border-radius: 0;
        height: auto;
        align-self: stretch;
        padding: 0 18px;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg-muted);
        cursor: pointer;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        box-shadow: none;
        transition: color 0.1s, border-bottom-color 0.1s;
    }

    .tab:hover,
    .tab:focus-visible {
        outline: none;
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
        box-shadow: none;
        transition: color 0.1s, background 0.1s;
    }

    .gear:hover,
    .gear:focus-visible {
        outline: none;
        color: var(--fg);
        background: var(--bg-hover);
    }

    .gear.active {
        color: var(--accent);
        background: var(--bg-hover);
    }

    /* ── Status bar ─────────────────────────────────────────────────────── */

    .statusbar {
        height: 26px;
        padding: 0 12px;
        display: flex;
        flex-flow: row nowrap;
        align-items: center;
        border-radius: 8px;
        flex-shrink: 0;
        font-size: 11px;
        color: var(--fg-muted);
        white-space: nowrap;
        overflow: hidden;
    }

    .statusbar-spinner {
        width: 10px;
        height: 10px;
        border: 1.5px solid var(--border);
        border-top-color: var(--fg-muted);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
        margin-left: 6px;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
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
        height: 14px;
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
        gap: 4px;
        padding: 0 6px;
    }

    .statusbar-link:hover {
        color: var(--fg);
        text-decoration: underline;
    }

    .statusbar-link.disabled {
        opacity: 0.4;
        pointer-events: none;
        cursor: default;
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

    .statusbar-import {
        margin-left: 6px;
        font-variant-numeric: tabular-nums;
    }

</style>
