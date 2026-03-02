<script lang="ts">
    import { createVirtualizer } from '@tanstack/svelte-virtual'
    import {loadTracks, importFiles, importSelected, importDuplicates} from '../stores/app'
    import Spinner from '../components/Spinner.svelte'

    let scanning = false
    let importing = false
    let jobId: string | null = null
    let importProgress = {current: 0, total: 0, filename: ''}
    let importResult: {imported: number; errors: number} | null = null

    // Cleanup functions for IPC listeners
    let offProgress: (() => void) | null = null
    let offFileComplete: (() => void) | null = null
    let offFileError: (() => void) | null = null
    let offDone: (() => void) | null = null

    function formatDuration(s: number | null): string {
        if (s == null) return '—'
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${String(sec).padStart(2, '0')}`
    }

    function formatSize(bytes: number): string {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function metaMatch(a: ImportFileInfo, b: ImportFileInfo): boolean {
        return a.title.toLowerCase() === b.title.toLowerCase() &&
            (a.artist ?? '').toLowerCase() === (b.artist ?? '').toLowerCase() &&
            Math.abs((a.duration ?? 0) - (b.duration ?? 0)) <= 3
    }

    async function mergeIncoming(incoming: ImportFileInfo[]): Promise<void> {
        const existingPaths = new Set($importFiles.map(f => f.path))

        // Path dedup against existing list
        let fresh = incoming.filter(f => !existingPaths.has(f.path))

        // Metadata dedup against existing list (catches same content at different paths)
        fresh = fresh.filter(f => !$importFiles.some(e => metaMatch(e, f)))

        // Metadata dedup within the incoming batch itself (keep first occurrence)
        const dedupedFresh: ImportFileInfo[] = []
        for (const f of fresh) {
            if (!dedupedFresh.some(e => metaMatch(e, f))) dedupedFresh.push(f)
        }
        fresh = dedupedFresh

        const baseIndex = $importFiles.length
        $importFiles = [...$importFiles, ...fresh]

        if (fresh.length === 0) return

        const dupIndices = await window.api.import.checkDuplicates(fresh)
        const newDups = new Set($importDuplicates)
        dupIndices.forEach(i => newDups.add(baseIndex + i))
        $importDuplicates = newDups

        const newSelected = new Set($importSelected)
        fresh.forEach((_, i) => {
            if (!newDups.has(baseIndex + i)) newSelected.add(baseIndex + i)
        })
        $importSelected = newSelected
    }

    async function selectFiles(): Promise<void> {
        scanning = true
        try {
            const incoming = await window.api.import.selectFiles()
            await mergeIncoming(incoming)
        } finally {
            scanning = false
        }
    }

    async function selectFolder(): Promise<void> {
        scanning = true
        try {
            const incoming = await window.api.import.selectFolder()
            await mergeIncoming(incoming)
        } finally {
            scanning = false
        }
    }

    $: selectableCount = $importFiles.filter((_, i) => !$importDuplicates.has(i)).length
    $: allChecked = selectableCount > 0 && $importSelected.size === selectableCount
    $: someChecked = $importSelected.size > 0 && $importSelected.size < selectableCount

    function toggleAll(e: Event): void {
        const checked = (e.target as HTMLInputElement).checked
        if (checked) {
            $importSelected = new Set($importFiles.map((_, i) => i).filter(i => !$importDuplicates.has(i)))
        } else {
            $importSelected = new Set()
        }
    }

    function toggleRow(i: number): void {
        if ($importDuplicates.has(i)) return
        const next = new Set($importSelected)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        $importSelected = next
    }

    function removeListeners(): void {
        offProgress?.(); offProgress = null
        offFileComplete?.(); offFileComplete = null
        offFileError?.(); offFileError = null
        offDone?.(); offDone = null
    }

    async function startImport(): Promise<void> {
        const selectedFiles = [...$importSelected].map(i => $importFiles[i])
        jobId = crypto.randomUUID()
        importProgress = {current: 0, total: selectedFiles.length, filename: ''}
        importing = true
        importResult = null

        removeListeners()

        offProgress = window.api.import.onProgress((p) => {
            if (p.jobId !== jobId) return
            importProgress = {current: p.fileIndex + 1, total: p.total, filename: p.filename}
        })

        offFileComplete = window.api.import.onFileComplete((_p) => {
            // progress is tracked via onProgress
        })

        offFileError = window.api.import.onFileError((_p) => {
            // errors counted in onDone
        })

        offDone = window.api.import.onDone(async (p) => {
            if (p.jobId !== jobId) return
            removeListeners()
            importing = false
            importResult = {imported: p.imported, errors: p.errors}
            await loadTracks()
        })

        await window.api.import.start(jobId, selectedFiles)
    }

    async function cancelImport(): Promise<void> {
        if (!jobId) return
        await window.api.import.cancel(jobId)
    }

    function clearList(): void {
        $importFiles = []
        $importSelected = new Set()
        $importDuplicates = new Set()
    }

    function reset(): void {
        $importFiles = []
        $importSelected = new Set()
        $importDuplicates = new Set()
        importResult = null
        jobId = null
    }

    // ── Virtual list ──────────────────────────────────────────────────────────

    let listEl: HTMLDivElement | undefined

    $: virtualizer =
        listEl &&
        createVirtualizer({
            count: $importFiles.length,
            getScrollElement: () => listEl!,
            estimateSize: () => 40,
            overscan: 10
        })
</script>

<div class="import-view">
    <!-- Toolbar -->
    <div class="toolbar">
        <button class="action-btn" on:click={selectFiles} disabled={scanning || importing}>
            Select Files…
        </button>
        <button class="action-btn" on:click={selectFolder} disabled={scanning || importing}>
            Select Folder
        </button>
        {#if $importFiles.length > 0 && !importing && !importResult}
            <button class="action-btn clear-btn" on:click={clearList} disabled={scanning}>
                Clear
            </button>
        {/if}
        {#if scanning}
            <span class="scan-status">
                <Spinner/>
                Scanning…
            </span>
        {/if}
    </div>

    {#if $importFiles.length > 0 && !importing && !importResult}
        <!-- Column headers — outside scroll container, matching LibraryView pattern -->
        <div class="header-row">
            <span class="col-check">
                <input
                    type="checkbox"
                    checked={allChecked}
                    indeterminate={someChecked}
                    on:change={toggleAll}
                />
            </span>
            <span class="col-title">Title</span>
            <span class="col-artist">Artist</span>
            <span class="col-duration">Duration</span>
            <span class="col-file">File</span>
        </div>

        <!-- Virtual scroll container -->
        <div class="list" bind:this={listEl}>
            {#if virtualizer}
                <div style="height: {$virtualizer.getTotalSize()}px; position: relative">
                    {#each $virtualizer.getVirtualItems() as row (row.index)}
                        {@const file = $importFiles[row.index]}
                        {@const i = row.index}
                        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                        <div
                            class="import-row"
                            class:selected={$importSelected.has(i)}
                            class:duplicate={$importDuplicates.has(i)}
                            style="position: absolute; top: 0; left: 0; width: 100%; height: {row.size}px; transform: translateY({row.start}px)"
                            on:click={() => toggleRow(i)}
                        >
                            <span class="col-check">
                                <input
                                    type="checkbox"
                                    checked={$importSelected.has(i)}
                                    disabled={$importDuplicates.has(i)}
                                    on:click|stopPropagation
                                    on:change={() => toggleRow(i)}
                                />
                            </span>
                            <span class="col-title" title={file.title}>
                                {file.title}
                                {#if $importDuplicates.has(i)}
                                    <span class="dup-badge">Already in library</span>
                                {/if}
                            </span>
                            <span class="col-artist">{file.artist ?? '—'}</span>
                            <span class="col-duration">{formatDuration(file.duration)}</span>
                            <span class="col-file" title={file.path}>{formatSize(file.size)}</span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Action bar -->
        <div class="action-bar">
            <span class="selection-count">{$importSelected.size} of {selectableCount} selected</span>
            <button
                    class="primary"
                    disabled={$importSelected.size === 0}
                    on:click={startImport}
            >
                Import selected ({$importSelected.size})…
            </button>
        </div>
    {/if}

    {#if importing}
        <!-- Progress view -->
        <div class="progress-view">
            <div class="progress-filename">{importProgress.filename}</div>
            <div class="progress-counter">{importProgress.current} / {importProgress.total}</div>
            <button class="action-btn" on:click={cancelImport}>Cancel</button>
        </div>
    {/if}

    {#if importResult}
        <!-- Completion summary -->
        <div class="result-view">
            <p class="result-text">
                Imported {importResult.imported} track{importResult.imported !== 1 ? 's' : ''}
                {#if importResult.errors > 0}, {importResult.errors} error{importResult.errors !== 1 ? 's' : ''}{/if}
            </p>
            <button class="primary" on:click={reset}>Done</button>
        </div>
    {/if}
</div>

<style>
    .import-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        height: var(--toolbar-height);
        flex-shrink: 0;
        background: var(--bg-toolbar);
    }

    .scan-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--fg-muted);
    }

    .action-btn {
        font-size: 12px;
        padding: 5px 12px;
    }

    .clear-btn {
        margin-left: auto;
    }

    /* Column headers — identical to LibraryView .header-row */
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

    /* Virtual scroll container — identical to LibraryView .list */
    .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
    }

    /* Row — mirrors LibraryView .track-row */
    .import-row {
        display: flex;
        align-items: center;
        padding: 0 12px;
        cursor: pointer;
        border-bottom: 1px solid var(--separator);
        transition: background 0.08s;
    }

    .import-row:hover { background: var(--bg-hover); }
    .import-row.selected { background: var(--bg-selected); }
    .import-row.duplicate { opacity: 0.45; cursor: default; }
    .import-row.duplicate:hover { background: transparent; }

    /* Columns */
    .col-check    { width: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .col-title    { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 12px; }
    .col-artist   { width: 180px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); padding-right: 12px; }
    .col-duration { width: 70px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; text-align: right; }
    .col-file     { width: 80px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; text-align: right; }

    .dup-badge {
        display: inline-block;
        margin-left: 6px;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--bg-hover);
        color: var(--fg-muted);
        vertical-align: middle;
        white-space: nowrap;
    }

    /* Action bar */
    .action-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-top: 1px solid var(--separator);
        flex-shrink: 0;
    }

    .selection-count {
        font-size: 12px;
        color: var(--fg-muted);
    }

    /* Progress view */
    .progress-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
    }

    .progress-filename {
        font-size: 13px;
        max-width: 80%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fg);
    }

    .progress-counter {
        font-size: 24px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--fg);
    }

    /* Result view */
    .result-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
    }

    .result-text {
        font-size: 14px;
        color: var(--fg);
    }
</style>
