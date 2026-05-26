# Deployment Guide

The production path is one Dockerized Go server behind Caddy on a small VPS. Keep one backend replica until room and session state move out of process memory.

## VPS Baseline

Install:

- Docker Engine with the Compose plugin
- A firewall allowing inbound `80/tcp`, `443/tcp`, and SSH
- A DNS `A` or `AAAA` record pointing the backend hostname to the VPS

Create a deployment directory:

```bash
mkdir -p ~/videotogether
```

Copy `deploy/docker-compose.yml`, `deploy/Caddyfile`, and a filled `.env` file into that directory.

## Environment File

Start from `deploy/.env.example`.

Required values:

- `SERVER_IMAGE`: immutable GHCR tag, such as `ghcr.io/yicheny0580/videotogetherlite-server:sha-abcdef0`.
- `BACKEND_DOMAIN`: hostname only, without `https://`.
- `CADDY_EMAIL`: email used by Caddy for ACME account notices.

Operational values:

- `ROOM_TTL`: room inactivity timeout, default `3m`.
- `ALLOWED_ORIGINS`: CORS and WebSocket origin policy, default `*`.

The broad origin default is intentional for the current architecture. The page app runs inside arbitrary video pages, so browser requests originate from those page origins. The backend does not use cookies; invite codes and session tokens are bearer values in JSON messages.

## Manual Deploy

```bash
cd ~/videotogether
docker compose pull
docker compose up -d
```

Check health:

```bash
curl --fail https://BACKEND_DOMAIN/healthz
```

Run the room and WebSocket smoke test:

```bash
BACKEND_PUBLIC_URL=https://BACKEND_DOMAIN just smoke-backend
```

Run the local Docker and Caddy smoke test before relying on the compose assets:

```bash
just smoke-docker
```

This builds `apps/server/Dockerfile`, starts the server behind a temporary Caddy container on `http://127.0.0.1:18080`, runs the backend smoke flow through Caddy, and tears the compose stack down.

The same verifier is available as the manual `Deployment Smoke` GitHub Actions workflow.

Test local rollback mechanics:

```bash
just smoke-rollback
```

This starts the Docker stack on a temporary local port, verifies a current image tag through Caddy, rewrites the stack to a previous image tag, verifies the rollback through Caddy, and creates validated current/previous extension ZIP artifacts.

Check logs:

```bash
docker compose logs -f server
docker compose logs -f caddy
```

Restart:

```bash
docker compose restart server
```

Rollback to a previous image tag:

```bash
sed -i.bak 's#SERVER_IMAGE=.*#SERVER_IMAGE=ghcr.io/yicheny0580/videotogetherlite-server:sha-previous#' .env
docker compose pull
docker compose up -d
curl --fail https://BACKEND_DOMAIN/healthz
```

## GitHub Actions Deploy

Use the `Backend Image` workflow to publish an immutable image tag, then run `Deploy Backend`.
After the target branch or tag is pushed to GitHub, the release workflow runner
can dispatch and watch the expected manual workflows:

```bash
RELEASE_CHANNEL=beta IMAGE_TAG=sha-abcdef0 just run-release-workflow ci deployment-smoke backend-image deploy-backend extension-package
```

For production tag releases:

```bash
RELEASE_CHANNEL=production RELEASE_REF=v3.0.23 just run-release-workflow backend-image deploy-backend extension-package
```

Use `RELEASE_DRY_RUN=1` to print the `gh workflow run` commands without
dispatching. Chrome Web Store upload is not part of the default sequence; run it
as an explicit step after listing, privacy, and tester settings are ready:

```bash
RELEASE_CHANNEL=beta CWS_PUBLISH_TYPE=upload_only just run-release-workflow chrome-web-store
```

Configure GitHub Actions environments:

- `beta`
- `production`

Audit the repository workflow and environment state:

```bash
just audit-release
```

This command is read-only. It checks that release workflows exist, the deploy workflow uses environment-scoped concurrency, the `beta` and `production` environments exist in GitHub, and the production environment has required reviewers.

Create or repair the expected environments:

```bash
PRODUCTION_REVIEWER=yicheny0580 just configure-github-envs
```

The command is idempotent. It creates `beta` and `production`; production gets a required user reviewer. Add secrets and environment variables in GitHub after the environments exist.

Environment secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `BACKEND_PUBLIC_URL` if not stored as an environment variable
- `CADDY_EMAIL` if not stored as an environment variable
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`

Environment variables:

- `BACKEND_PUBLIC_URL`
- `CADDY_EMAIL`
- `ROOM_TTL`
- `ALLOWED_ORIGINS`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

Use environment variables for non-secret release inputs and environment secrets for credentials:

```bash
gh variable set BACKEND_PUBLIC_URL --env beta --body https://beta.example.com
gh variable set CADDY_EMAIL --env beta --body admin@example.com
gh variable set CWS_PUBLISHER_ID --env beta --body publisher-id
gh variable set CWS_EXTENSION_ID --env beta --body extension-id

gh secret set VPS_HOST --env beta --body vps.example.com
gh secret set VPS_USER --env beta --body deploy
gh secret set VPS_SSH_KEY --env beta < ~/.ssh/videotogether_deploy
gh secret set CWS_CLIENT_ID --env beta --body client-id
gh secret set CWS_CLIENT_SECRET --env beta --body client-secret
gh secret set CWS_REFRESH_TOKEN --env beta --body refresh-token
```

Repeat for `production` with its production backend URL, VPS target, and Chrome Web Store item ID.

You can also set the same inputs from local environment variables or a dotenv-style file:

```bash
cp .release-inputs.example.env .release-inputs.env
RELEASE_INPUTS_FILE=.release-inputs.env just configure-github-env-inputs
```

Each key can be global, such as `BACKEND_PUBLIC_URL`, or channel-specific, such as `BETA_BACKEND_PUBLIC_URL` or `PRODUCTION_BACKEND_PUBLIC_URL`. Channel-specific keys take precedence. The filled `.release-inputs.env` file contains secrets and is ignored by git.

Use required reviewers on the `production` environment. The deploy workflow has per-environment concurrency so two production deploys cannot race.

## Caddy Behavior

Caddy terminates TLS and proxies plain HTTP to `server:8080`. WebSocket upgrades are handled by `reverse_proxy`. The Caddyfile uses `/healthz` as the active upstream health check.
