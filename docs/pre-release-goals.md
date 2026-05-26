# Pre-Release Prep Goals

This document tracks the repo work needed before releasing the rewritten
VideoTogether Lite backend and Chrome extension. The target release path is:

- Backend: Dockerized Go service on a tiny VPS behind Caddy.
- CI/CD: GitHub Actions for checks, image publishing, deployment, and extension
  artifacts.
- Extension: private beta first, then public or unlisted Chrome Web Store
  release.
- Docs: wording updated so the repo describes the current implementation rather
  than its fork-era history.

## Release Principles

- Keep the backend to one running replica until room/session state moves out of
  process memory.
- Treat the production backend URL and Chrome Web Store item IDs as
  environment-specific release inputs.
- Keep secrets in GitHub Actions environments, not checked-in files.
- Make beta testing explicit: separate backend host, tester-only store
  distribution, and clear feedback instructions.
- Keep privacy, permissions, and store listing text consistent with actual
  extension behavior.

## Backend Deployment

- [x] Add a production `Dockerfile` for `apps/server`.
  - Build a static or minimal Go binary.
  - Run as a non-root user.
  - Expose an HTTP port for Caddy to proxy to.

- [x] Make the server deployment-friendly behind Caddy.
  - Support `$PORT` or `$LISTEN_ADDR`.
  - Prefer plain HTTP inside Docker.
  - Keep direct TLS mode only if it is still useful for manual deployments.

- [x] Add backend health and lifecycle support.
  - Add `/healthz` for GitHub Actions and Caddy checks.
  - Add graceful shutdown on `SIGTERM`/`SIGINT`.
  - Make room TTL configurable.

- [x] Tighten production network policy.
  - Review CORS and WebSocket origin handling.
  - Allow the published extension/backend host combinations needed for release.
  - Document the tradeoff if broad origins are intentionally kept.

- [x] Add VPS deployment assets.
  - `deploy/docker-compose.yml`
  - `deploy/Caddyfile`
  - `.env.example` for non-secret deployment variables
  - clear instructions for DNS, firewall, logs, restart, and rollback

## GitHub Actions CI/CD

- [x] Split CI from deployment.
  - Keep PR/push checks for lint, typecheck, tests, Go tests, and builds.
  - Use manually triggered or tag-triggered workflows for deployment.

- [x] Add backend image workflow.
  - Build Docker image from `apps/server`.
  - Tag images with git SHA and release tag.
  - Push immutable images to GHCR.

- [x] Add VPS deploy workflow.
  - Use GitHub Actions environment secrets.
  - SSH to the VPS.
  - Pull the selected image tag.
  - Run `docker compose up -d`.
  - Verify `/healthz` through the public Caddy URL.

- [x] Configure GitHub Actions environments.
  - `beta`
  - `production`

- [x] Define required secrets and variables per environment.
  - `VPS_HOST`
  - `VPS_USER`
  - `VPS_SSH_KEY`
  - `BACKEND_PUBLIC_URL`
  - `CWS_PUBLISHER_ID`
  - `CWS_EXTENSION_ID`
  - Chrome Web Store OAuth/client credentials
  - any registry credentials not covered by `GITHUB_TOKEN`

- [x] Gate production deploys.
  - Use required reviewers for the `production` environment.
  - Add deployment concurrency so two production deploys cannot race.

## Extension Release Channels

- [x] Decide Chrome Web Store item strategy.
  - For short beta testing: use one private item with trusted testers.
  - For long-running beta in parallel with production: use a separate beta item.
  - For production: decide public vs unlisted.

- [x] Add channel-specific build support.
  - `beta` builds point at the beta backend URL.
  - `production` builds point at the production backend URL.
  - Artifact names include channel, manifest version, and git SHA.

- [x] Add extension package workflow.
  - Clean `apps/extension/dist`.
  - Build with the selected backend URL.
  - Validate `manifest.json`.
  - Zip the Chrome Web Store package.
  - Upload the ZIP as a GitHub Actions artifact.

- [x] Add Chrome Web Store upload workflow.
  - Upload package to an existing Chrome Web Store item.
  - Require manifest version bumps.
  - Prefer staged/deferred publish after review.
  - Keep initial item setup, privacy fields, listing, and trusted tester setup
    manual until the store item is stable.

- [x] Prepare beta tester flow.
  - Maintain the selected tester email list outside the repo.
  - Document how testers install the private item.
  - Document how testers report bugs.
  - Document known limitations and rollback/reinstall steps.

## Chrome Store Readiness

- [x] Audit manifest permissions.
  - Justify `<all_urls>`, `all_frames`, `storage`, and `activeTab`.
  - Remove unused permissions.
  - Keep the extension single-purpose and easy to explain.

- [x] Prepare store listing content.
  - Short description.
  - Long description.
  - Screenshots.
  - Icon and promotional assets.
  - Support URL or email.
  - Privacy policy URL.

- [x] Prepare Chrome review notes.
  - State the extension's single purpose.
  - Explain why it injects into pages with videos.
  - Explain backend communication.
  - Confirm no remote code is executed.
  - Provide test instructions if review needs a room-sync scenario.

- [x] Prepare privacy declarations.
  - Generated user ID.
  - Nickname.
  - Invite code and session token.
  - Shared video URL/title/playback state.
  - Language.
  - Local storage and session storage behavior.
  - In-memory backend retention and room expiration.

## Repo-Wide Docs And Wording

- [x] Rewrite root README files.
  - Update `README.MD`.
  - Update `README_zh.MD`.
  - Remove fork-era support wording and stale upstream URLs.
  - Describe the current product directly.

- [x] Add or update project identity metadata.
  - Extension name and description.
  - Package names and versions where relevant.
  - Support links and issue links.

- [x] Add user documentation.
  - `docs/user-guide.md`
  - `docs/zh-cn/user-guide.md`
  - Cover install, create room, join room, pick video, follow shared video,
    leave room, and troubleshooting.

- [x] Add development documentation.
  - `docs/development.md`
  - Keep `docs/zh-cn/development.md` in sync.
  - Cover local setup, build modes, tests, e2e tests, and backend host override.

- [x] Add deployment documentation.
  - `docs/deployment.md`
  - Cover tiny VPS, Docker, Caddy, GitHub Actions, secrets, logs, rollback, and
    health checks.

- [x] Add release documentation.
  - `docs/release-checklist.md`
  - Cover beta and production gates.
  - Include backend deploy, extension publish, smoke tests, monitoring, and
    rollback.

- [x] Add privacy documentation.
  - `docs/privacy.md`
  - Use this as the source of truth for Chrome Web Store privacy fields.

- [x] Refresh backend docs.
  - Update `apps/server/README.md`.
  - Make Docker + Caddy the main production path.
  - Mention in-memory state and single-replica deployment.

- [x] Refresh API docs.
  - Update `docs/HttpApiSpec.md`.
  - Document WebSocket behavior, room TTL, state model, and release
    compatibility expectations.

- [x] Add stale wording checks.
  - Scan docs for old repo URLs.
  - Scan for `fork`, removed legacy feature claims, old backend hosts, and old
    release instructions.

## Verification Before Beta

- [ ] `just check` passes locally and in GitHub Actions.
- [x] Backend Docker image runs locally.
- [x] Caddy reverse proxy handles HTTP and WebSocket traffic.
- [ ] Beta backend is deployed from GitHub Actions.
- [ ] Beta extension ZIP is built by GitHub Actions.
- [ ] Beta Chrome Web Store item is private and limited to trusted testers.
- [ ] Create/join/update/leave room flow passes through the public beta URL.
- [x] YouTube, Bilibili, and basic HTML video smoke tests pass.
- [ ] Privacy and tester docs are published or linked from the store listing.

## Verification Before Production

- [ ] Production backend is deployed from a tagged image.
- [ ] Production extension build uses the production backend URL.
- [ ] Store listing, privacy fields, permissions, and review notes are final.
- [ ] Production release checklist is complete.
- [x] Rollback path is tested for backend and extension package.
- [x] Monitoring/log review process is documented.

## References

- Chrome Web Store publishing:
  https://developer.chrome.com/docs/webstore
- Chrome Web Store update and testing channel guidance:
  https://developer.chrome.com/docs/webstore/update/
- Chrome trusted tester account guidance:
  https://developer.chrome.com/docs/webstore/set-up-account
- Chrome Web Store API:
  https://developer.chrome.com/docs/webstore/using-api
- GitHub Actions secrets:
  https://docs.github.com/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions
- GitHub Actions environments:
  https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments
