# Chrome Store Readiness

## Item Strategy

Selected release strategy:

- Beta uses one private Chrome Web Store item limited to trusted testers.
- A separate beta item is only needed if beta must run for a long time in parallel with production.
- Production starts as an unlisted item for the first public release window, then can move to public distribution after the support and review process is stable.

Initial item setup, listing fields, privacy fields, screenshots, and trusted tester configuration stay manual until the store item is stable. After that, use the `Chrome Web Store Upload` workflow for package upload and staged publish.

## Permission Audit

Manifest permissions:

- `<all_urls>` content script match: required because users can watch videos on many websites, and the extension must detect video elements on the active page.
- `all_frames`: required because video players are often embedded in iframes.
- `storage`: required to keep generated user ID, nickname, room/session state, language, and UI state.
- `activeTab`: required for popup-to-active-tab control.

No `host_permissions` are declared. No remote code is executed.

## Listing Draft

Short description:

```text
Sync video playback with friends using invite-code rooms.
```

Long description:

```text
VideoTogether Lite lets a small group watch videos together from Chrome. Create an invite-code room, share the code, choose the video you want to share, and let others follow your playback state.

The extension shares only the selected video's URL, title, and playback state with the configured VideoTogether Lite backend. Rooms are temporary and expire from backend memory when participants leave or time out.
```

Support:

- Support URL: `https://github.com/yicheny0580/VideoTogetherLite/issues`
- Privacy policy URL: link to the published copy of `docs/privacy.md`.

Assets to prepare manually:

- Current extension icon.
- Popup screenshot.
- Floating panel screenshot on a basic video page.
- Room invite/follow flow screenshot.
- Optional promotional image if the selected distribution mode requires one.

## Review Notes

Use these points in the Chrome review notes:

- The extension has one purpose: synchronize selected video playback in invite-code rooms.
- It injects a page app so users can pick and control videos embedded in normal pages and iframes.
- Backend communication uses HTTPS and WSS against the configured release backend.
- The backend stores room state in memory and expires inactive rooms.
- No remote code is loaded or executed by the extension.
- Review test: create a room on a page with an HTML video, install the same build in a second Chrome profile, join with the invite code, share the first video, then follow it from the second profile.

## Tester Flow

Keep tester email lists outside the repo. Send testers:

- Private item install link.
- Target test backend/channel.
- Known limitations.
- Bug report link.
- Reinstall or rollback instructions if the package changes during the test.
