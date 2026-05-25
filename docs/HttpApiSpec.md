# HTTP API specification

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

#### GET /api/v1/timestamp

Returns server time and the current runtime version token.

```json
{
  "timestamp": 1.123,
  "videoTogetherLiteVersion": 123
}
```

#### POST /api/v1/rooms/create

Creates a room, joins the creator as a participant, and returns an invite code.

```json
{
  "userId": "user-1",
  "nickname": "Alice"
}
```

#### POST /api/v1/rooms/join

Joins an existing room using a generated invite code.

```json
{
  "inviteCode": "ABCD2345.secret",
  "userId": "user-2",
  "nickname": "Bob"
}
```

#### POST /api/v1/rooms/get

Gets room participant state using a room session token.

```json
{
  "sessionToken": "..."
}
```

#### POST /api/v1/rooms/update

Updates the current participant nickname, presence, sharing flag, and optional shared video state.

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

#### POST /api/v1/rooms/leave

Leaves the current room. The server deletes the room immediately when the last participant leaves or times out.

```json
{
  "sessionToken": "..."
}
```

Room responses include:

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

#### GET /api/v1/ws

WebSocket endpoint for room updates.

Client messages use:

```json
{
  "id": "1",
  "type": "room.get",
  "data": {
    "sessionToken": "..."
  }
}
```

Supported message types:

- `room.create`
- `room.join`
- `room.get`
- `room.leave`
- `room.update`

Server messages include direct responses with the request `id`, `room.updated` broadcasts, `timestamp.replay`, and structured `error` responses.
