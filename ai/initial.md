# Local Music Combiner

## Technical Requirements Specification

Version: 1.0\
Generated: 2026-03-01 14:25:42 UTC

------------------------------------------------------------------------

# 1. Overview

## 1.1 Goal

Develop a macOS desktop application (Electron-based) that:

-   Acts as the primary local audio player
-   Maintains an autonomous music library (SQLite stored alongside audio
    files)
-   Supports searching and downloading tracks via yt-dlp
-   Automatically converts and normalizes audio
-   Supports shuffle with playback history
-   Runs stably in background for long sessions
-   Allows exporting the collection to a FAT32 flash drive
-   Works fully offline for playback

Personal project. No App Store or DRM requirements.

------------------------------------------------------------------------

# 2. Technology Stack

-   Electron
-   Svelte (renderer)
-   Node.js (main process)
-   SQLite (library.db)
-   yt-dlp (search/download)
-   ffmpeg (conversion + loudness normalization)

------------------------------------------------------------------------

# 3. Architecture

## 3.1 Process Separation

### Main Process

Contains business logic:

-   LibraryService
-   DownloadService
-   AudioProcessingService
-   PlayerService
-   DeviceSyncService
-   SettingsService

Renderer communicates only via IPC.

### Renderer (Svelte)

-   Library View
-   Mini Player View
-   Settings View
-   Download Panel
-   Queue Panel

------------------------------------------------------------------------

# 4. File Structure

    /MusicArchive
        /tracks
            000001.mp3
            000002.mp3
        library.db
        settings.json

Design decisions:

-   Numeric filenames only
-   Metadata stored in SQLite
-   Flat directory structure
-   FAT32 compatible
-   Max file size \< 4GB

------------------------------------------------------------------------

# 5. Database Schema

## tracks table

``` sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    original_query TEXT,
    source_url TEXT,
    duration INTEGER,
    bitrate INTEGER,
    file_size INTEGER,
    added_at DATETIME,
    normalized INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ok',
    hash TEXT
);
```

Indexes required on: - title - artist - hash

------------------------------------------------------------------------

# 6. Functional Requirements

## 6.1 Library Management

-   Display 2k--20k tracks
-   Search by title + artist
-   Sorting
-   Multi-select
-   Batch delete
-   Mark missing files

Sync rules: - Database is source of truth - Missing file → status =
'missing' - File without DB entry → ignored - Deleting DB entry deletes
file

------------------------------------------------------------------------

## 6.2 Download & Import

Search using:

    yt-dlp "ytsearch1:QUERY" --dump-json

Download using:

    yt-dlp -x --audio-format mp3 --audio-quality 0 URL

Pipeline: 1. Convert to mp3 if needed 2. Normalize audio 3. Strip
metadata 4. Rename to numeric ID 5. Insert into DB

------------------------------------------------------------------------

# 7. Audio Processing

## 7.1 Conversion

-   Output format: mp3
-   Bitrate: 192k or 256k
-   Remove unnecessary metadata

## 7.2 Loudness Normalization

Use ffmpeg loudnorm:

    ffmpeg -i input.mp3 -af loudnorm=I=-14:LRA=11:TP=-1.5 output.mp3

-   Default LUFS: -14
-   Toggle in settings
-   Normalization before DB hash calculation

------------------------------------------------------------------------

# 8. Player Architecture

## 8.1 Player State

-   queue: TrackID\[\]
-   history: TrackID\[\]
-   currentIndex: number
-   mode: linear \| shuffle
-   crossfade: boolean
-   crossfadeDuration: number

## 8.2 Shuffle Behavior

-   Generate shuffled queue once
-   Linear traversal
-   History allows backward navigation

## 8.3 Playback

-   Web Audio API
-   Two audio sources for crossfade
-   Gapless preferred

## 8.4 System Media Controls

Support: - Play/Pause - Next - Previous - MediaSession metadata

------------------------------------------------------------------------

# 9. UI Requirements

## 9.1 Main Window

-   Library table
-   Search bar
-   Download input
-   Collapsible queue panel

## 9.2 Mini Player

-   Track title
-   Progress bar
-   Play/Pause
-   Prev/Next
-   Shuffle toggle
-   Resizable with minimum size

## 9.3 Themes

-   Light
-   Dark
-   System
-   Manual override

------------------------------------------------------------------------

# 10. Device Sync

-   Select target folder
-   Copy all tracks
-   Optional overwrite
-   No delta sync required (MVP)
-   FAT32 compatibility

------------------------------------------------------------------------

# 11. Performance Requirements

-   Up to 20k tracks
-   Search \< 50ms
-   Memory \< 500MB at 10k tracks
-   Stable 8+ hours playback
-   No memory leaks
-   Proper AudioContext cleanup

------------------------------------------------------------------------

# 12. Non-Goals

-   Mobile version
-   Cloud sync
-   DRM support
-   Album artwork (v1)
-   Playlists (v1)

------------------------------------------------------------------------

# 13. MVP Scope

Includes: - Library management - Search - Download - Normalization -
Shuffle + history - Mini player - System media controls

Excludes: - Crossfade (optional future feature) - Advanced
recommendations

------------------------------------------------------------------------

# 14. Development Phases

Phase 1: - Project scaffold - SQLite integration - Library UI

Phase 2: - Player core - Queue + shuffle logic

Phase 3: - Download + processing pipeline

Phase 4: - Mini player - System media integration

Phase 5: - Crossfade (optional)
