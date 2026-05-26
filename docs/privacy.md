# Privacy Notes

This document is the source of truth for Chrome Web Store privacy declarations.

## Purpose

VideoTogether Lite syncs video playback state for participants who join the same invite-code room. It is single-purpose: create or join a room, choose a video, share playback state, and follow another participant's shared playback state.

## Data Stored In The Browser

The extension uses Chrome storage and page/session state for:

- Generated user ID for the browser profile.
- Nickname entered by the user.
- Current invite code and room session token.
- Selected language.
- Local panel and room UI state.

Session storage may hold temporary page state used to connect the popup, content script, and injected page app.

## Data Sent To The Backend

The backend receives:

- Generated user ID.
- Nickname.
- Invite code, invite secret, and room code.
- Session token.
- Selected language.
- Shared video URL and title.
- Playback state: current time, duration, paused state, loading state, playback rate, and update timestamps.

The backend does not need account credentials, payment data, contacts, browsing history, or page content unrelated to the selected shared video.

## Backend Retention

Room, participant, and session state is stored in backend memory only. It is not written to a database by the current implementation.

Rooms expire when the last participant leaves or when all participants are inactive beyond `ROOM_TTL`, which defaults to `3m`. Restarting the backend clears all rooms and sessions.

## Third Parties

The extension communicates with the configured VideoTogether Lite backend. It does not execute remote code. Chrome Web Store distribution, GitHub Actions, GHCR, the VPS provider, and Caddy/Let's Encrypt are release infrastructure rather than application data processors.

## User Controls

Users can:

- Choose whether to create or join a room.
- Choose their nickname.
- Choose which video to share.
- Stop following another participant.
- Stop sharing or leave the room.
- Clear extension data through Chrome extension/site data controls.
