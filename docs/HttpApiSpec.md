# HTTP And WebSocket API Specification

The Go implementation lives in `apps/server`. TypeScript protocol types for the Chrome extension live in `packages/shared`.

All room APIs are under `/api/v1`, use JSON, and return either a success body or a structured error:

```json
{
  "error": {
    "code": "wrong_invite_secret",
    "message": "Wrong invite code"
  }
}
```

## Release Compatibility

The API is versioned by path. Keep additive response changes backward-compatible with the current Chrome extension release. Breaking changes should use a new path version or a coordinated backend and extension rollout.

The extension sends a runtime `version` query parameter for cache/state compatibility checks, but the server does not use it for routing.

## State Model

The backend keeps all state in memory:

- Rooms are keyed by generated room code.
- Invite codes combine room code and invite secret.
- Session tokens authenticate subsequent room operations.
- A browser-profile user can have one active room session at a time.
- Participant state includes nickname, last-seen server time, sharing flag, and optional shared video state.

Rooms are deleted when the last participant leaves or when all participants are inactive beyond `ROOM_TTL`. The default TTL is `3m`.

## Health

### GET /healthz

Returns process health for Caddy and GitHub Actions checks.

```json
{
  "status": "ok",
  "timestamp": 1.123,
  "videoTogetherLiteVersion": 123
}
```

## HTTP Endpoints

### GET /api/v1/timestamp

Returns server time and the current runtime version token.

```json
{
  "timestamp": 1.123,
  "videoTogetherLiteVersion": 123
}
```

### POST /api/v1/rooms/create

Creates a room, joins the creator as a participant, and returns an invite code.

Request:

```json
{
  "userId": "user-1",
  "nickname": "Alice"
}
```

### POST /api/v1/rooms/join

Joins an existing room using either `inviteCode` or `roomCode` plus `inviteSecret`.

Request:

```json
{
  "inviteCode": "ABCD2345.secret",
  "userId": "user-2",
  "nickname": "Bob"
}
```

### POST /api/v1/rooms/get

Gets room participant state using a room session token.

Request:

```json
{
  "sessionToken": "..."
}
```

### POST /api/v1/rooms/update

Updates the current participant nickname, presence, sharing flag, and optional shared video state.

Request:

```json
{
  "sessionToken": "...",
  "nickname": "Alice",
  "sharing": true,
  "sendLocalTimestamp": 1.123,
  "focusedVideo": {
    "url": "https://example.test/watch",
    "title": "Example",
    "currentTime": 1.123,
    "duration": 600,
    "paused": false,
    "playbackRate": 1,
    "isLoading": false,
    "lastUpdateClientTime": 1.123,
    "lastUpdateServerTime": 0
  }
}
```

When `sharing` is true, `focusedVideo` is required. The server overwrites `lastUpdateServerTime` with its own timestamp before storing the state.

### POST /api/v1/rooms/leave

Leaves the current room. The server deletes the room immediately when the last participant leaves or times out.

Request:

```json
{
  "sessionToken": "..."
}
```

## Room Response

```json
{
  "inviteCode": "ABCD2345.secret",
  "inviteSecret": "secret",
  "room": {
    "roomCode": "ABCD2345",
    "uuid": "...",
    "participantCount": 1,
    "participants": [
      {
        "userId": "user-1",
        "nickname": "Alice",
        "sharing": true,
        "lastSeenServerTime": 1.123,
        "focusedVideo": {
          "url": "https://example.test/watch",
          "title": "Example",
          "currentTime": 1.123,
          "duration": 600,
          "paused": false,
          "playbackRate": 1,
          "isLoading": false,
          "lastUpdateClientTime": 1.123,
          "lastUpdateServerTime": 1.123
        }
      }
    ]
  },
  "sessionToken": "...",
  "timestamp": 1.123
}
```

## WebSocket

### GET /api/v1/ws

WebSocket endpoint for room updates. The extension uses it as the live update channel and keeps HTTP as the fallback for direct room operations.

Client messages:

```json
{
  "id": "1",
  "type": "room.get",
  "data": {
    "sessionToken": "..."
  }
}
```

Supported client message types:

- `room.create`
- `room.join`
- `room.get`
- `room.leave`
- `room.update`

Server messages:

- Direct responses echo the request `id` and message `type`.
- `room.updated` broadcasts current room state after joins, leaves, and updates.
- `timestamp.replay` returns client and server timestamps after room updates.
- `error` returns the same structured error body used by HTTP.

WebSocket connections are room-scoped after a successful create, join, get, or update message. Slow clients can be disconnected when their send queue is full.

## Origin Policy

`ALLOWED_ORIGINS` controls both CORS and WebSocket origin checks. The release default is `*` because the injected page app sends requests from arbitrary video-page origins. If the architecture changes to route backend traffic through a stable extension origin, set a comma-separated allow list.
