# Development Guide

## Prerequisites

- Node.js 24 or newer
- pnpm 11.3 or newer
- Go 1.26.3
- `just`

## Setup

```bash
just setup
just setup-browser
```

`just setup` installs JS dependencies and downloads Go modules. `just setup-browser` installs Playwright Chromium for local extension runs and e2e tests.

## Local Modes

Run the full local loop:

```bash
just dev
```

This builds the Go server into a temporary binary, starts it in debug mode on `http://127.0.0.1:5001`, watches the extension build, opens Chromium with `apps/extension/dist`, opens the popup, and opens a local HTML video fixture.

Run only the server and extension watcher:

```bash
just watch
```

Open Chromium against an existing build:

```bash
just browser
```

Run only the backend:

```bash
just server
```

## Backend Host Override

The extension reads `VITE_VIDEOTOGETHER_LITE_HOST` at build time.

```bash
VITE_VIDEOTOGETHER_LITE_HOST=https://beta.example.com pnpm build:extension
```

If the value is not set, development builds use `http://127.0.0.1:5001`.

## Checks

```bash
just check
```

This runs linting, stale wording checks, typechecks, JS tests, extension build, and Go tests.

Individual commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
go test ./apps/server/...
```

Run extension e2e tests:

```bash
just test-e2e
```

Run the backend smoke flow against a local or deployed backend:

```bash
BACKEND_PUBLIC_URL=https://beta.example.com just smoke-backend
```

The smoke flow checks `/healthz`, timestamp, create, join, update, leave, and a WebSocket `room.updated` broadcast.

Run the backend Docker image behind a temporary Caddy reverse proxy:

```bash
just smoke-docker
```

This requires a running Docker daemon and may pull the Go, distroless, and Caddy images.

## Release Builds

Use GitHub Actions for release artifacts:

- `Backend Image` publishes the Go server image to GHCR.
- `Deploy Backend` updates a VPS environment through Docker Compose and Caddy.
- `Extension Package` builds a channel-specific ZIP artifact.
- `Chrome Web Store Upload` uploads a version-bumped ZIP to an existing store item.

Beta and production builds must set `BACKEND_PUBLIC_URL` in their matching GitHub Actions environments.

After release workflows run on a pushed commit, audit the GitHub-side evidence:

```bash
RELEASE_CHANNEL=beta just audit-actions
```

The audit checks the current commit for successful CI, Docker/Caddy deployment smoke, and a channel-specific extension package artifact.
