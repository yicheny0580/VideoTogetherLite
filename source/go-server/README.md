# VideoTogether Lite Go Server

This server keeps only the core room-sync API used by the Chrome lite extension.

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

- `GET /timestamp`
- `GET /room/update`
- `GET /room/get`
- `GET /ws`
