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
- `POST /api/v1/rooms/create`
- `POST /api/v1/rooms/join`
- `POST /api/v1/rooms/get`
- `POST /api/v1/rooms/update`
- `POST /api/v1/rooms/leave`
- `GET /api/v1/ws`

Rooms use generated invite codes. Subsequent calls use the returned `sessionToken`.
A browser-profile user can have one active room session at a time.
