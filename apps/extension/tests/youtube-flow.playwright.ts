import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/extensionTest";
import {
  createButton,
  fillInvite,
  fillNickname,
  inviteCodeText,
  joinButton,
  pickFirstVideo,
  statusText
} from "./helpers/panel";

const youtubeTestUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const targetTime = 5;
const longVideoTargetTime = 218;
const activeUnbufferedTargetTime = 500;

interface YouTubeState {
  currentTime: number;
  duration: number;
  errorText: string;
  paused: boolean;
}

declare global {
  interface Window {
    __videoTogetherLiteYouTubeSeekCount?: number;
  }
}

async function waitForYouTubePlayer(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    const player = video?.closest(".html5-video-player") as {
      getCurrentTime?: () => number;
      getPlayerState?: () => number;
    } | null;
    return Boolean(
      video
      && player
      && typeof player.getCurrentTime === "function"
      && typeof player.getPlayerState === "function"
    );
  }, null, { timeout: 60_000 });

  await expect.poll(async () => (await getYouTubeState(page)).duration > 0, {
    timeout: 60_000
  }).toBe(true);
}

async function getYouTubeState(page: Page): Promise<YouTubeState> {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("YouTube video element is unavailable.");
    }

    const player = video.closest(".html5-video-player") as {
      getCurrentTime?: () => number;
      getDuration?: () => number;
      getPlayerState?: () => number;
    } | null;
    const finiteNumber = (value: unknown): number | null => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : null;
    };
    const playerState = Number(player?.getPlayerState?.());
    const visibleError = Array.from(document.querySelectorAll(".ytp-error-content-wrap-reason, .ytp-error"))
      .find((element) => element instanceof HTMLElement && element.offsetParent !== null);

    return {
      currentTime: finiteNumber(player?.getCurrentTime?.()) ?? finiteNumber(video.currentTime) ?? 0,
      duration: finiteNumber(player?.getDuration?.()) ?? finiteNumber(video.duration) ?? 0,
      errorText: visibleError?.textContent?.trim() ?? "",
      paused: video.paused || (Number.isFinite(playerState) ? playerState !== 1 && playerState !== 3 : false)
    };
  });
}

async function tryGetYouTubeState(page: Page): Promise<YouTubeState | null> {
  try {
    return await getYouTubeState(page);
  } catch {
    return null;
  }
}

async function setYouTubePausedTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((targetSeconds) => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("YouTube video element is unavailable.");
    }
    const player = video.closest(".html5-video-player") as {
      pauseVideo?: () => void;
    } | null;

    player?.pauseVideo?.();
    video.pause();
    video.currentTime = targetSeconds;
  }, seconds);

  await expect.poll(async () => {
    const state = await tryGetYouTubeState(page);
    return state !== null && Math.abs(state.currentTime - seconds) <= 5;
  }, {
    timeout: 30_000
  }).toBe(true);
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const player = video?.closest(".html5-video-player") as {
      pauseVideo?: () => void;
    } | null;
    player?.pauseVideo?.();
    video?.pause();
  }).catch(() => undefined);
}

async function waitForYouTubeTime(
  page: Page,
  seconds: number,
  timeout = 30_000,
  tolerance = 2
): Promise<void> {
  await expect.poll(async () => {
    const state = await tryGetYouTubeState(page);
    return state !== null && Math.abs(state.currentTime - seconds) <= tolerance;
  }, { timeout }).toBe(true);
}

async function seekYouTubePlayer(
  page: Page,
  seconds: number,
  allowSeekAhead: boolean
): Promise<void> {
  await page.evaluate(({ allowSeekAhead: seekAhead, targetSeconds }) => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("YouTube video element is unavailable.");
    }
    const player = video.closest(".html5-video-player") as {
      pauseVideo?: () => void;
      seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    } | null;
    if (typeof player?.seekTo !== "function") {
      throw new Error("YouTube player seek API is unavailable.");
    }

    player.pauseVideo?.();
    video.pause();
    player.seekTo(targetSeconds, seekAhead);
  }, { allowSeekAhead, targetSeconds: seconds });
}

async function expectUrlTimestamp(page: Page, seconds: number): Promise<void> {
  await expect.poll(async () => new URL(page.url()).searchParams.get("t"), {
    timeout: 30_000
  }).toBe(`${seconds}s`);
}

async function expectNoUrlTimestampAfter(page: Page, timeout = 6_000): Promise<void> {
  await page.waitForTimeout(timeout);
  expect(new URL(page.url()).searchParams.get("t")).toBeNull();
}

async function expectNoYouTubePlaybackError(page: Page): Promise<void> {
  await expect.poll(async () => (await getYouTubeState(page)).errorText, {
    timeout: 10_000
  }).toBe("");
}

async function installYouTubeSeekCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const player = video?.closest(".html5-video-player") as {
      seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
    } | null;
    if (!player || typeof player.seekTo !== "function") {
      window.__videoTogetherLiteYouTubeSeekCount = 0;
      return;
    }
    const originalSeekTo = player.seekTo.bind(player);
    window.__videoTogetherLiteYouTubeSeekCount = 0;
    player.seekTo = (seconds, allowSeekAhead) => {
      window.__videoTogetherLiteYouTubeSeekCount = (window.__videoTogetherLiteYouTubeSeekCount ?? 0) + 1;
      return originalSeekTo(seconds, allowSeekAhead);
    };
  });
}

async function getYouTubeSeekCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__videoTogetherLiteYouTubeSeekCount ?? 0);
}

async function resetYouTubeSeekCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__videoTogetherLiteYouTubeSeekCount = 0;
  });
}

async function syncPausedYouTubeVideo({
  expectedBobSeekCount,
  openExternal,
  openIsolatedExternal,
  openPopupForPage,
  targetSeconds,
  url
}: {
  expectedBobSeekCount: number;
  openExternal: (url: string) => Promise<Page>;
  openIsolatedExternal: (url: string) => Promise<Page>;
  openPopupForPage: (targetPage: Page) => Promise<Page>;
  targetSeconds: number;
  url: string;
}): Promise<{ alice: Page; alicePopup: Page; bob: Page; bobPopup: Page }> {
  const alice = await openExternal(url);
  await waitForYouTubePlayer(alice);
  await installYouTubeSeekCounter(alice);
  const alicePopup = await openPopupForPage(alice);
  await fillNickname(alicePopup, "Alice");
  await createButton(alicePopup).click();
  await expect(alicePopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(alicePopup, alice);
  await expect(alicePopup.locator(".vtl-participant-video").filter({ hasText: "Alice" })).toBeVisible({
    timeout: 30_000
  });
  await setYouTubePausedTime(alice, targetSeconds);
  await resetYouTubeSeekCount(alice);
  await expect(statusText(alicePopup)).toContainText("Sync");
  await expectNoYouTubePlaybackError(alice);
  const inviteCode = await inviteCodeText(alicePopup).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedExternal(url);
  await waitForYouTubePlayer(bob);
  await installYouTubeSeekCounter(bob);
  const bobPopup = await openPopupForPage(bob);
  await fillNickname(bobPopup, "Bob");
  await fillInvite(bobPopup, inviteCode);
  await joinButton(bobPopup).click();
  await expect(bobPopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await bobPopup.getByRole("button", { name: "Follow" }).click();

  await waitForYouTubeTime(bob, targetSeconds, 30_000, 5);
  await expectNoYouTubePlaybackError(bob);
  await expectNoYouTubePlaybackError(alice);
  expect(await getYouTubeSeekCount(alice)).toBe(0);
  expect(await getYouTubeSeekCount(bob)).toBe(expectedBobSeekCount);

  return { alice, alicePopup, bob, bobPopup };
}

test("syncs a real YouTube video through the YouTube adapter", async ({
  openExternal,
  openIsolatedExternal,
  openPopupForPage
}, testInfo) => {
  testInfo.setTimeout(120_000);

  await syncPausedYouTubeVideo({
    expectedBobSeekCount: 1,
    openExternal,
    openIsolatedExternal,
    openPopupForPage,
    targetSeconds: targetTime,
    url: youtubeTestUrl
  });
});

test("does not crash or spam seeks after a long YouTube seek", async ({
  openExternal,
  openIsolatedExternal,
  openPopupForPage
}, testInfo) => {
  testInfo.setTimeout(150_000);

  const { bob } = await syncPausedYouTubeVideo({
    expectedBobSeekCount: 0,
    openExternal,
    openIsolatedExternal,
    openPopupForPage,
    targetSeconds: longVideoTargetTime,
    url: youtubeTestUrl
  });

  await bob.waitForTimeout(4_000);
  expect(await getYouTubeSeekCount(bob)).toBe(0);
  await expectNoYouTubePlaybackError(bob);
});

test("keeps a followed YouTube room synced after active seeks", async ({
  openExternal,
  openIsolatedExternal,
  openPopupForPage
}, testInfo) => {
  testInfo.setTimeout(180_000);

  const { alice, alicePopup, bob } = await syncPausedYouTubeVideo({
    expectedBobSeekCount: 1,
    openExternal,
    openIsolatedExternal,
    openPopupForPage,
    targetSeconds: targetTime,
    url: youtubeTestUrl
  });

  await seekYouTubePlayer(alice, 15, true);
  await waitForYouTubeTime(alice, 15);
  await waitForYouTubeTime(bob, 15);
  await expectNoYouTubePlaybackError(alice);
  await expectNoYouTubePlaybackError(bob);

  expect(new URL(alice.url()).searchParams.get("t")).toBeNull();
  await seekYouTubePlayer(alice, activeUnbufferedTargetTime, true);
  await waitForYouTubeTime(alice, activeUnbufferedTargetTime, 60_000);
  await expectNoUrlTimestampAfter(alice);
  await expectUrlTimestamp(bob, activeUnbufferedTargetTime);
  await waitForYouTubeTime(bob, activeUnbufferedTargetTime, 60_000);
  await expect(alicePopup.locator(".vtl-participant-video").filter({ hasText: "Alice" })).toBeVisible({
    timeout: 30_000
  });
  await expectNoYouTubePlaybackError(bob);

  await seekYouTubePlayer(alice, activeUnbufferedTargetTime + 5, false);
  await waitForYouTubeTime(bob, activeUnbufferedTargetTime + 5, 45_000);
  await expectNoYouTubePlaybackError(alice);
  await expectNoYouTubePlaybackError(bob);
});
