# VideoTogether Lite

VideoTogether Lite is a Chrome extension and Go backend for watching videos together. A user creates an invite-code room, other viewers join with nicknames, and participants can explicitly share the video they are watching so everyone else can follow the same playback state.

[中文](./README_zh.MD)

## What Is Included

- `apps/extension`: Chrome MV3 extension built with Vite, TypeScript, React, and Tailwind.
- `apps/server`: Go room-sync API and WebSocket backend.
- `packages/shared`: shared protocol, language, URL, and time-sync helpers.
- `deploy`: Docker Compose and Caddy assets for a tiny VPS deployment.
- `.github/workflows`: CI, backend image publishing, backend deploy, extension package, and Chrome Web Store upload workflows.

## Install Locally

```bash
just setup
just build-extension
```

Open `chrome://extensions`, enable developer mode, and load `apps/extension/dist` as an unpacked extension.

## Development

Prerequisites:

- Node.js 24 or newer
- pnpm 11.3 or newer
- Go 1.26.3
- `just`

Run the full local loop:

```bash
just setup
just setup-browser
just dev
```

`just dev` starts the Go debug server on `http://127.0.0.1:5001`, watches the extension build, and opens a Chromium profile with the unpacked extension and a local video fixture.

Run the local verification suite:

```bash
just check
```

More details:

- [User guide](./docs/user-guide.md)
- [Development guide](./docs/development.md)
- [Deployment guide](./docs/deployment.md)
- [Release checklist](./docs/release-checklist.md)
- [Privacy notes](./docs/privacy.md)
- [Chrome Store notes](./docs/chrome-store.md)
- [HTTP and WebSocket API](./docs/HttpApiSpec.md)

## Release Shape

The backend is intended to run as one Dockerized Go process behind Caddy until room state is moved out of process memory. Release builds pass the backend URL through `VITE_VIDEOTOGETHER_LITE_HOST`; beta and production should each use their own GitHub Actions environment values.

Support and issue tracking: https://github.com/yicheny0580/VideoTogetherLite/issues
