### HTTP API specification

#### GET /timestamp

Returns server time and the current runtime version token.

```json
{
  "timestamp": 1.123,
  "vtVersion": 123
}
```

#### GET /room/get

Gets room playback state.

| Parameter | Description |
| --- | --- |
| `name` | Room name |
| `password` | Room password |

#### GET /room/update

Creates or updates a room as the host.

| Parameter | Description |
| --- | --- |
| `name` | Room name |
| `password` | Room password |
| `playbackRate` | Playback rate |
| `currentTime` | Current video time |
| `paused` | `true` or `false` |
| `url` | Host page URL |
| `lastUpdateClientTime` | Host client timestamp |
| `duration` | Video duration |
| `tempUser` | Host temporary user ID |
| `protected` | `true` or `false` |
| `videoTitle` | Page/video title |

Room responses include:

```json
{
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
  "waitForLoadding": false,
  "beginLoaddingTimestamp": 0,
  "memberCount": 1,
  "timestamp": 1.123
}
```

#### GET /ws

WebSocket endpoint for room updates.

Supported methods:

- `/room/join`
- `/room/update`
- `/room/update_member`
- `replay_timestamp`
