# Release Checklist

Use this file for beta and production releases. The backend URL, Chrome Web Store item IDs, and OAuth credentials are environment-specific values.

## Workflow Runner

After the target branch or tag is pushed to GitHub, the manual workflow sequence
can be dispatched from the CLI:

```bash
RELEASE_CHANNEL=beta IMAGE_TAG=sha-abcdef0 just run-release-workflow ci deployment-smoke backend-image deploy-backend extension-package
```

The default step list is `ci`, `deployment-smoke`, `backend-image`,
`deploy-backend`, and `extension-package`. Use `RELEASE_DRY_RUN=1` to print the
GitHub CLI commands without dispatching. Chrome Web Store upload is intentionally
explicit:

```bash
RELEASE_CHANNEL=beta CWS_PUBLISH_TYPE=upload_only just run-release-workflow chrome-web-store
```

## Beta

- Confirm `just check` passes locally.
- Run `just audit-release` and review any external GitHub environment failures.
- Run `PRODUCTION_REVIEWER=yicheny0580 just configure-github-envs` if environments or production reviewers are missing.
- Set each environment's required variables and secrets, then rerun `just audit-release`.
- Use `.release-inputs.example.env` as the template for `.release-inputs.env`, then run `RELEASE_INPUTS_FILE=.release-inputs.env just configure-github-env-inputs`.
- Confirm `just smoke-docker` passes locally.
- Run the `Deployment Smoke` workflow if local Docker cannot pull the required images.
- Run the `CI` workflow on the target commit.
- Run `just audit-actions` after CI, deployment smoke, and extension package workflows finish.
- Run `Backend Image` and record the immutable image tag.
- Run `Deploy Backend` for the `beta` environment.
- Verify `BACKEND_PUBLIC_URL/healthz`.
- Run `BACKEND_PUBLIC_URL=https://beta.example.com just smoke-backend`.
- Run `Extension Package` for `beta`.
- Confirm the ZIP name includes `beta`, manifest version, and git SHA.
- Confirm `RELEASE_CHANNEL=beta just audit-actions` finds the ZIP artifact for the target commit.
- Upload or run `Chrome Web Store Upload` against the private tester item.
- Confirm the tester email list is maintained outside the repo.
- Smoke test create, join, update, and leave through the public beta URL.
- Confirm the backend smoke command observes a WebSocket `room.updated` broadcast.
- Smoke test YouTube, Bilibili, and a basic HTML video page.
- Send testers the install link, bug-report path, known limitations, and reinstall instructions.

## Production

- Require reviewer approval on the `production` GitHub Actions environment.
- Confirm `just audit-release` reports all GitHub environment checks passing.
- Build the backend image from a release tag.
- Deploy production from the tagged image.
- Build the production extension with the production backend URL.
- Use `RELEASE_CHANNEL=production RELEASE_REF=v3.0.23 just run-release-workflow backend-image deploy-backend extension-package` for the production workflow sequence.
- Confirm manifest version is greater than the current Chrome Web Store version.
- Confirm store listing, screenshots, privacy fields, permissions, and review notes are final.
- Prefer `STAGED_PUBLISH` so the approved item can be released deliberately.
- Smoke test create, join, update, leave, and WebSocket room updates through production.
- Run `BACKEND_PUBLIC_URL=https://production.example.com just smoke-backend`.
- Review `docker compose logs server` and `docker compose logs caddy` after release.
- Confirm backend rollback to the previous image tag.
- Confirm extension rollback path with the previous approved ZIP or Chrome Web Store dashboard flow.
- Run `just smoke-rollback` to test local backend image rollback and extension ZIP fallback artifacts before production.

## Rollback

Backend:

1. Edit `.env` on the VPS and set `SERVER_IMAGE` to the previous immutable tag.
2. Run `docker compose pull`.
3. Run `docker compose up -d`.
4. Verify `/healthz` and a room create/join smoke test.

Extension:

1. Stop publishing the new package if it is staged or still under review.
2. If already published, use the Chrome Web Store rollback path or upload a fixed version with a higher manifest version.
3. Ask testers to reinstall only when Chrome does not update quickly enough for the test window.

Local rollback verifier:

```bash
just smoke-rollback
```

This command verifies the backend rollback mechanics through Docker Compose and Caddy, then builds and validates two extension ZIP artifacts that represent current and rollback packages.

## Monitoring

The current stack relies on Caddy and Docker logs. During beta, review:

- Backend start, shutdown, and request logs.
- Caddy proxy errors.
- Tester reports for room expiration, invite failures, and unsupported video pages.
