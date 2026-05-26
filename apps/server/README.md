# VideoTogether Lite Go Server

This server provides the room-sync API used by the Chrome extension. The public contract is the versioned JSON and WebSocket API under `/api/v1`.

## Development

```bash
go test ./...
go run . debug
```

The debug server listens on `127.0.0.1:5001`.

## Runtime Configuration

- `LISTEN_ADDR`: full listen address, for example `:8080`.
- `PORT`: port-only fallback when `LISTEN_ADDR` is not set.
- `ROOM_TTL`: inactive participant and room expiration duration, default `3m`.
- `ALLOWED_ORIGINS`: comma-separated CORS/WebSocket origin allow list, default `*`.
- `TLS_ENABLED`: set to `true` only for direct TLS mode.
- `CERT_FILE` and `KEY_FILE`: certificate files for direct TLS mode.

Modes:

- `debug`: plain HTTP on `127.0.0.1:5001`.
- `prod`: plain HTTP on `:8080`, intended for Docker behind Caddy.
- `prod-tls`: direct TLS on `:5000` for manual deployments that still need it.

## Production

Preferred path:

```bash
docker build -t videotogetherlite-server ./apps/server
docker run --rm -p 8080:8080 videotogetherlite-server
```

In release, run the image through `deploy/docker-compose.yml` with Caddy terminating TLS and proxying to the server over plain HTTP.

The backend keeps rooms, participants, and sessions in process memory. Run one replica until that state is moved to an external store.

## Health

```bash
curl http://127.0.0.1:8080/healthz
```

## API Surface

- `GET /healthz`
- `GET /api/v1/timestamp`
- `POST /api/v1/rooms/create`
- `POST /api/v1/rooms/join`
- `POST /api/v1/rooms/get`
- `POST /api/v1/rooms/update`
- `POST /api/v1/rooms/leave`
- `GET /api/v1/ws`

Rooms use generated invite codes. Subsequent calls use the returned `sessionToken`.
