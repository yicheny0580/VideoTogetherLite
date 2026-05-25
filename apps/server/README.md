# VideoTogether Lite Go Server

This server keeps only the core room-sync API used by the Chrome lite extension.
The public contract is the versioned JSON API under `/api/v1`.

## Development

```bash
go test ./...
go run . debug
```

The debug server listens on `127.0.0.1:5001`.

## Production

```bash
go build -o server
CERT_FILE=/path/fullchain.pem KEY_FILE=/path/privkey.pem ./server prod
```

The production server listens on `:5000` with TLS.

## API Surface

- `GET /api/v1/timestamp`
- `POST /api/v1/rooms/join`
- `POST /api/v1/rooms/get`
- `POST /api/v1/rooms/host-update`
- `POST /api/v1/rooms/member-update`
- `GET /api/v1/ws`

Room passwords are sent only in JSON bodies during initial join/host claim.
Subsequent calls use the returned `sessionToken`.
