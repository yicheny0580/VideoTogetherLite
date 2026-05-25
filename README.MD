# VideoTogether

## VideoTogether Lite is a Chrome extension that syncs video playback with friends in real time.

## Visit http://2gether.video/ for more information

[ English ] [ [中文](https://github.com/VideoTogether/VideoTogether/blob/main/README_zh.MD) ]

## Installation

Build the extension and load the unpacked Chrome MV3 output from `apps/extension/dist`.

```bash
just setup
just build-extension
```

## Development

This repository is a pnpm monorepo with a Go debug server.

Prerequisites:

- Node.js 24 or newer
- pnpm 11.3 or newer
- Go 1.26.3
- `just`

For the full local loop, install dependencies and Playwright Chromium, then start the Go server, Vite extension watcher, and a Chromium profile with the unpacked extension loaded:

```bash
just setup
just setup-browser
just dev
```

`just dev` serves the extension against `http://127.0.0.1:5001`, opens the extension popup, and opens a local fixture page with a video element. Use `just watch` to run only the server and extension watcher, or `just browser` to open an existing build from `apps/extension/dist`.

Run the local verification suite with:

```bash
just check
```

### Extension

The Chrome extension app lives in `apps/extension` and is built with Vite, TypeScript, React, and Tailwind. The main runtime layers are:

- content script: injects the page app and loading state
- page app: owns room sync orchestration and the floating panel
- popup app: owns extension enable/disable settings
- shared package: protocol, language, URL state, and time-sync helpers

For local server testing:

```bash
just dev
```

### Service

The Go service code is in `apps/server`.
