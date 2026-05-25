# HTTP API specification

The Go implementation lives in `apps/server`. TypeScript protocol types for the Chrome extension live in `packages/shared`.

All room APIs are under `/api/v1`, use JSON, and return either a success body or a structured error:

```json
{
  "error": {
    "code": "wrong_password",
    "message": "Wrong Password"
  }
}
```

#### GET /api/v1/timestamp

Returns server time and the current runtime version token.

```json
{
  "timestamp": 1.123,
  "videoTogetherLiteVersion": 123
}
```

#### POST /api/v1/rooms/host-update

Creates, claims, or updates a room as host. Initial create/claim sends `password`; later updates send `sessionToken`.

```json
{
  "name": "room",
  "password": "pw",
  "userId": "host-1",
  "playbackRate": 1,
  "currentTime": 1.123,
  "paused": false,
  "url": "https://example.test/watch",
  "lastUpdateClientTime": 1.123,
  "duration": 600,
  "protected": true,
  "videoTitle": "Example",
  "sendLocalTimestamp": 1.123
}
```

#### POST /api/v1/rooms/join

Joins an existing room as a member and returns a `sessionToken`.

```json
{
  "name": "room",
  "password": "pw",
  "userId": "member-1"
}
```

#### POST /api/v1/rooms/get

Gets room playback state using a room session token.

```json
{
  "name": "room",
  "sessionToken": "..."
}
```

#### POST /api/v1/rooms/member-update

Updates member presence/loading state using a member session token.

```json
{
  "roomName": "room",
  "sessionToken": "...",
  "userId": "member-1",
  "currentUrl": "https://example.test/watch",
  "isLoading": false,
  "sendLocalTimestamp": 1.123
}
```

Room responses include:

```json
{
  "room": {
    "name": "room",
    "lastUpdateClientTime": 1.123,
    "lastUpdateServerTime": 1.123,
    "playbackRate": 1,
    "currentTime": 1.123,
    "paused": false,
    "url": "https://example.test/watch",
    "duration": 600,
    "protected": true,
    "videoTitle": "Example",
    "uuid": "...",
    "waitForLoading": false,
    "beginLoadingTimestamp": 0,
    "memberCount": 1
  },
  "sessionToken": "...",
  "timestamp": 1.123
}
```

#### GET /api/v1/ws

WebSocket endpoint for room updates.

Client messages use:

```json
{
  "id": "1",
  "type": "room.get",
  "data": {}
}
```

Supported message types:

- `room.join`
- `room.get`
- `room.hostUpdate`
- `room.memberUpdate`

Server messages include direct responses with the request `id`, `room.updated` broadcasts, `timestamp.replay`, and structured `error` responses.
