# my-music-box

A personal desktop music player and local collection manager built with Electron + Svelte.

Search YouTube, download audio, and manage your library — all in one place.

## Requirements

- macOS (Apple Silicon or Intel)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — audio downloading
- [ffmpeg](https://ffmpeg.org/) — audio encoding and normalization

Install both via Homebrew:

```sh
brew install yt-dlp ffmpeg
```

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run package
```

## Legal Disclaimer

This application can download audio from online sources including YouTube.

**Users are solely responsible for ensuring they have the legal right to download any content.** In particular:

- Downloading YouTube videos or audio may violate [YouTube's Terms of Service](https://www.youtube.com/t/terms).
- Downloaded content may be protected by copyright. Downloading copyrighted material without authorization may violate applicable law, including the DMCA (US) and equivalent legislation in other jurisdictions.
- This tool is intended for personal use with content you own or have rights to (e.g. your own uploads, Creative Commons, or public domain material).

The authors of this software assume no liability for any misuse or illegal use by end users.

## License

[MIT](LICENSE)
