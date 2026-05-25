# VideoTogether

## VideoTogether Lite is a Chrome extension that syncs video playback with friends in real time.

## Visit http://2gether.video/ for more information

[ English ] [ [中文](https://github.com/VideoTogether/VideoTogether/blob/main/README_zh.MD) ]

## Installation

Build the extension and load the unpacked Chrome MV3 output from `apps/extension/dist`.

```bash
npx pnpm@latest install
npx pnpm@latest build:extension
```

## Development

This repository is a pnpm monorepo.

```bash
npx pnpm@latest lint
npx pnpm@latest typecheck
npx pnpm@latest test
npx pnpm@latest build
go test ./apps/server/...
```

### Extension

The Chrome extension app lives in `apps/extension` and is built with Vite, TypeScript, React, and Tailwind. The main runtime layers are:

- content script: injects the page app and loading state
- page app: owns room sync orchestration and the floating panel
- popup app: owns extension enable/disable settings
- shared package: protocol, language, URL state, and time-sync helpers

For local server testing:

```bash
VITE_VT_HOST=http://127.0.0.1:5001 npx pnpm@latest --filter @videotogether/extension dev
```

### Service

The Go service code is in `apps/server`.
