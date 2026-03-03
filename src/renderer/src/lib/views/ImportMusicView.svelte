<script lang="ts">
    import { tick } from 'svelte'
    import { createVirtualizer } from '@tanstack/svelte-virtual'
    import {importFiles, importSelected, importDuplicates, importScanning, activeImportJob, importJobResult} from '../stores/app'
    import Spinner from '../components/Spinner.svelte'
    import logoUrl from '../../../../../assets/logo.svg?url'

    let scanning = false
    let scanProgress = { done: 0, total: 0 }

    function startScanProgress(): () => void {
        scanProgress = { done: 0, total: 0 }
        return window.api.import.onScanProgress((p) => {
            if (scanProgress.total !== p.total || p.done % 5 === 0 || p.done === p.total) {
                scanProgress = p
            }
        })
    }

    let dragging = false

    $: importing = $activeImportJob !== null

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
        $importScanning = true
        const off = startScanProgress()
        try {
            const incoming = await window.api.import.selectFiles()
            await mergeIncoming(incoming)
        } finally {
            scanning = false
            $importScanning = false
            off()
        }
    }

    async function selectFolder(): Promise<void> {
        scanning = true
        $importScanning = true
        const off = startScanProgress()
        try {
            const incoming = await window.api.import.selectFolder()
            await mergeIncoming(incoming)
        } finally {
            scanning = false
            $importScanning = false
            off()
        }
    }

    async function handleDrop(e: DragEvent): Promise<void> {
        dragging = false
        const files = Array.from(e.dataTransfer?.files ?? [])
        if (files.length === 0) return
        const paths = files.map((f) => window.api.import.getPathForFile(f)).filter(Boolean)
        if (paths.length === 0) return
        scanning = true
        $importScanning = true
        const off = startScanProgress()
        try {
            const incoming = await window.api.import.scanPaths(paths)
            await mergeIncoming(incoming)
        } finally {
            scanning = false
            $importScanning = false
            off()
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

    async function startImport(): Promise<void> {
        const selectedFiles = [...$importSelected].map(i => $importFiles[i])
        const jobId = crypto.randomUUID()
        importJobResult.set(null)
        activeImportJob.set({
            jobId,
            current: 0,
            total: selectedFiles.length,
            filename: '',
            items: selectedFiles.map(f => ({
                filename: f.title || f.path.split('/').pop() || f.path,
                status: 'queued'
            }))
        })
        await window.api.import.start(jobId, selectedFiles)
    }

    async function cancelImport(): Promise<void> {
        const job = $activeImportJob
        if (!job) return
        await window.api.import.cancel(job.jobId)
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
        importJobResult.set(null)
        activeImportJob.set(null)
    }

    // ── Progress track list auto-scroll ───────────────────────────────────────

    let progressListEl: HTMLDivElement | undefined

    $: if (importing && $activeImportJob?.current !== undefined) {
        scrollToProcessing()
    }

    async function scrollToProcessing(): Promise<void> {
        await tick()
        if (!progressListEl) return
        progressListEl.querySelector('.processing')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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

    {#if $importFiles.length === 0 && !importing && !$importJobResult}
        <!-- ── Empty / drop zone ──────────────────────────────────────────── -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="drop-zone"
            class:drag-over={dragging}
            on:dragover|preventDefault={() => (dragging = true)}
            on:dragleave={() => (dragging = false)}
            on:drop|preventDefault={handleDrop}
        >
            {#if scanning}
                <p class="drop-hint">Scanning…</p>
                {#if scanProgress.total > 0}
                    <p class="scan-count-label">{scanProgress.done} / {scanProgress.total} files</p>
                    <progress class="scan-progress" value={scanProgress.done} max={scanProgress.total}></progress>
                {:else}
                    <Spinner />
                {/if}
            {:else}
                <img class="drop-icon" src={logoUrl} alt="My Music Box" aria-hidden="true" />
                <p class="drop-hint">
                    Select audio files or a folder to add to the import list.<br>
                    You can also drag and drop files here.
                </p>
                <div class="drop-buttons">
                    <button class="action-btn icon-btn" on:click={selectFiles} disabled={scanning}>
                        <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
                            <path d="M7 1H2.5A1.5 1.5 0 0 0 1 2.5v8A1.5 1.5 0 0 0 2.5 12h7A1.5 1.5 0 0 0 11 10.5V5L7 1z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                            <path d="M7 1v4h4" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                        </svg>
                        Select Files…
                    </button>
                    <button class="action-btn icon-btn" on:click={selectFolder} disabled={scanning}>
                        <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
                            <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h2.586a1 1 0 0 1 .707.293L7 3h4.5A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11h-9A1.5 1.5 0 0 1 1 9.5v-7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                        </svg>
                        Select Folder
                    </button>
                </div>
            {/if}
        </div>
    {/if}

    {#if $importFiles.length > 0 && !importing && !$importJobResult}
        <!-- ── Toolbar (only when list has items) ───────────────────────── -->
        <div class="toolbar">
            <button class="action-btn icon-btn" on:click={selectFiles} disabled={scanning || importing}>
                <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
                    <path d="M7 1H2.5A1.5 1.5 0 0 0 1 2.5v8A1.5 1.5 0 0 0 2.5 12h7A1.5 1.5 0 0 0 11 10.5V5L7 1z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                    <path d="M7 1v4h4" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                </svg>
                Select Files…
            </button>
            <button class="action-btn icon-btn" on:click={selectFolder} disabled={scanning || importing}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
                    <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h2.586a1 1 0 0 1 .707.293L7 3h4.5A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11h-9A1.5 1.5 0 0 1 1 9.5v-7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
                </svg>
                Select Folder
            </button>
            <button class="action-btn clear-btn" on:click={clearList} disabled={scanning || importing}>
                Clear
            </button>
            {#if scanning}
                <span class="scan-status">
                    <Spinner/>
                    {#if scanProgress.total > 0}
                        Scanning…
                        <span class="scan-nums"
                            style="min-width: calc({scanProgress.total.toString().length * 2 + 3} * 1ch)"
                        >{scanProgress.done} / {scanProgress.total}</span>
                    {:else}
                        Scanning…
                    {/if}
                </span>
            {/if}
        </div>

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
                            <span class="col-title">
                                <span class="title-text" title={file.title}>{file.title}</span>
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
        <!-- Toolbar with buttons disabled during import -->
        <div class="toolbar">
            <button class="action-btn" disabled>Select Files…</button>
            <button class="action-btn" disabled>Select Folder</button>
            <span class="import-counter">{$activeImportJob?.current ?? 0} / {$activeImportJob?.total ?? 0}</span>
        </div>
        <!-- Progress view -->
        <div class="progress-view">
            <div class="track-list-wrap">
                <div class="track-list" bind:this={progressListEl}>
                    {#each $activeImportJob?.items ?? [] as item}
                        <div class="track-row" class:processing={item.status === 'processing'} class:done={item.status === 'done'} class:error={item.status === 'error'}>
                            <span class="track-icon">
                                {#if item.status === 'queued'}
                                    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/></svg>
                                {:else if item.status === 'processing'}
                                    <svg class="spinning" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20" stroke-dashoffset="8" stroke-linecap="round"/></svg>
                                {:else if item.status === 'done'}
                                    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" fill="currentColor" opacity="0.2"/><path d="M5.5 8l1.8 1.8 3.2-3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                {:else}
                                    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" fill="currentColor" opacity="0.2"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                                {/if}
                            </span>
                            <span class="track-name">{item.filename}</span>
                        </div>
                    {/each}
                </div>
                <div class="fade-top"></div>
                <div class="fade-bottom"></div>
            </div>
            <button class="action-btn" on:click={cancelImport}>Cancel</button>
        </div>
    {/if}

    {#if $importJobResult}
        <!-- Completion summary -->
        <div class="result-view">
            <p class="result-text">
                Imported {$importJobResult.imported} track{$importJobResult.imported !== 1 ? 's' : ''}
                {#if $importJobResult.errors > 0}, {$importJobResult.errors} error{$importJobResult.errors !== 1 ? 's' : ''}{/if}
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

    /* ── Empty / drag-drop zone ──────────────────────────────────── */
    .drop-zone {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 32px;
        text-align: center;
        transition: background 0.12s, outline 0.12s;
        outline: 2px dashed transparent;
        outline-offset: -12px;
        border-radius: 4px;
    }

    .drop-zone.drag-over {
        background: var(--bg-selected);
        outline-color: var(--accent);
    }

    .drop-icon {
        width: 72px;
        height: 72px;
        opacity: 0.85;
    }

    .drop-hint {
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.6;
        max-width: 320px;
        margin: 0;
    }

    .drop-buttons {
        display: flex;
        gap: 10px;
        margin-top: 4px;
    }

    .scan-count-label {
        font-size: 13px;
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
        width: 240px;
        max-width: 80%;
        text-align: center;
        margin: 0;
    }

    .scan-progress {
        width: 240px;
        max-width: 80%;
        height: 4px;
        accent-color: var(--accent);
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

    .scan-nums {
        font-variant-numeric: tabular-nums;
        display: inline-block;
        text-align: right;
    }

    .action-btn {
        font-size: 12px;
        padding: 5px 12px;
    }

    .icon-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
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
    .import-row.duplicate { cursor: default; }
    .import-row.duplicate:hover { background: transparent; }
    .import-row.duplicate .col-check,
    .import-row.duplicate .col-artist,
    .import-row.duplicate .col-duration,
    .import-row.duplicate .col-file { opacity: 0.45; }
    .import-row.duplicate .title-text { opacity: 0.45; }

    /* Columns */
    .col-check    { width: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .col-title    { flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden; padding-right: 12px; }
    .title-text   { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-artist   { width: 180px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); padding-right: 12px; }
    .col-duration { width: 70px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; text-align: right; }
    .col-file     { width: 80px; flex-shrink: 0; color: var(--fg-muted); font-variant-numeric: tabular-nums; text-align: right; }

    .dup-badge {
        display: inline-block;
        flex-shrink: 0;
        margin-left: 0;
        font-size: 10px;
        font-weight: 500;
        padding: 1px 6px;
        border-radius: 3px;
        background: #16a34a22;
        color: #16a34a;
        border: 1px solid #16a34a44;
        vertical-align: middle;
        white-space: nowrap;
    }

    :global([data-theme='dark']) .dup-badge {
        background: #22c55e1a;
        color: #4ade80;
        border-color: #22c55e33;
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

    .import-counter {
        margin-left: auto;
        font-size: 12px;
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
    }

    /* Progress view */
    .progress-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 0 0 16px;
        min-height: 0;
    }

    /* ── Rolling track list ───────────────────────────────────── */
    .track-list-wrap {
        position: relative;
        flex: 1;
        min-height: 0;
        width: 100%;
    }

    .track-list {
        height: 100%;
        overflow-y: auto;
        scrollbar-width: none;
        padding: 24px 0;
    }

    .track-list::-webkit-scrollbar { display: none; }

    .track-row {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 36px;
        padding: 0 40px;
        font-size: 13px;
        color: var(--fg-muted);
        opacity: 0.45;
        transition: opacity 0.2s, color 0.2s;
    }

    .track-row.processing {
        opacity: 1;
        color: var(--fg);
    }

    .track-row.done {
        opacity: 0.55;
    }

    .track-row.error {
        opacity: 1;
        color: var(--error, #e05252);
    }

    .track-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: inherit;
    }

    .track-icon svg {
        width: 16px;
        height: 16px;
    }

    .track-icon .spinning {
        animation: track-spin 0.8s linear infinite;
        color: var(--accent);
    }

    @keyframes track-spin {
        to { transform: rotate(360deg); }
    }

    .track-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fade-top,
    .fade-bottom {
        position: absolute;
        left: 0;
        right: 0;
        height: 72px;
        pointer-events: none;
    }

    .fade-top {
        top: 0;
        background: linear-gradient(to bottom, var(--bg), transparent);
    }

    .fade-bottom {
        bottom: 0;
        background: linear-gradient(to top, var(--bg), transparent);
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
