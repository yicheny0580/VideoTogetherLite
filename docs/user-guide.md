# User Guide

VideoTogether Lite syncs playback state for videos you choose to share in an invite-code room.

## Install

For local testing:

1. Run `just setup` and `just build-extension`.
2. Open `chrome://extensions`.
3. Enable developer mode.
4. Load the unpacked extension from `apps/extension/dist`.

For beta testing, install the private Chrome Web Store item from the tester link shared by the maintainer.

## Create A Room

1. Open a page with a video.
2. Open the VideoTogether Lite extension popup.
3. Enter a nickname.
4. Select `Create room`.
5. Copy the invite code and send it to the other viewers.

The invite code includes both the room code and invite secret. Treat it like a room password.

## Join A Room

1. Open a page with a video.
2. Open the extension popup.
3. Enter a nickname.
4. Paste the invite code.
5. Select `Join room`.

A browser profile can be in one room at a time. Creating or joining another room moves that profile out of the previous room.

## Pick And Share A Video

1. Open the floating panel or popup on a page with a video.
2. Select `Pick video`.
3. Click the video element you want to share.
4. Start sharing from the panel.

Only the chosen video is shared. Page browsing and unrelated videos are not sent to the room.

## Follow A Shared Video

1. Join the same room as another participant.
2. Open a compatible page with a matching video.
3. Select the participant in `Shared videos`.
4. Select `Follow`.

Some pages require a manual play click because browser autoplay rules block programmatic playback.

## Leave A Room

Use `Exit room` in the popup or panel. The backend deletes a room when the last participant leaves or when all participants time out.

## Troubleshooting

- `No videos found on this page`: reload the page after the video player is visible, then reopen the popup.
- `Need to play manually`: click play in the page video player once.
- Invite code rejected: ask the host for a fresh invite code.
- Room disappeared: the in-memory backend expires inactive rooms after the configured room TTL.
- Popup says page unavailable: switch to a normal web page with a video and reload it.
