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

const youtubeTestUrl = "https://www.youtube.com/watch?v=Nz_tzgbB4Ws";
const targetTime = 42;
const longVideoTargetTime = 625;

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
      currentTime: finiteNumber(video.currentTime) ?? finiteNumber(player?.getCurrentTime?.()) ?? 0,
      duration: finiteNumber(video.duration) ?? finiteNumber(player?.getDuration?.()) ?? 0,
      errorText: visibleError?.textContent?.trim() ?? "",
      paused: video.paused || (Number.isFinite(playerState) ? playerState !== 1 && playerState !== 3 : false)
    };
  });
}

async function setYouTubePausedTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((targetSeconds) => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("YouTube video element is unavailable.");
    }

    video.pause();
    video.currentTime = targetSeconds;
  }, seconds);

  await expect.poll(async () => Math.abs((await getYouTubeState(page)).currentTime - seconds) <= 5, {
    timeout: 30_000
  }).toBe(true);
  await expect.poll(async () => (await getYouTubeState(page)).paused, {
    timeout: 30_000
  }).toBe(true);
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

async function syncPausedYouTubeVideo({
  openExternal,
  openIsolatedExternal,
  targetSeconds,
  url
}: {
  openExternal: (url: string) => Promise<Page>;
  openIsolatedExternal: (url: string) => Promise<Page>;
  targetSeconds: number;
  url: string;
}): Promise<{ alice: Page; bob: Page }> {
  const alice = await openExternal(url);
  await waitForYouTubePlayer(alice);
  await installYouTubeSeekCounter(alice);
  await fillNickname(alice, "Alice");
  await createButton(alice).click();
  await expect(alice.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(alice);
  await expect(alice.locator(".vtl-participant-video").filter({ hasText: "Alice" })).toBeVisible({
    timeout: 30_000
  });
  await setYouTubePausedTime(alice, targetSeconds);
  await expect(statusText(alice)).toContainText("Sync");
  await expectNoYouTubePlaybackError(alice);
  const inviteCode = await inviteCodeText(alice).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedExternal(url);
  await waitForYouTubePlayer(bob);
  await installYouTubeSeekCounter(bob);
  await fillNickname(bob, "Bob");
  await fillInvite(bob, inviteCode);
  await joinButton(bob).click();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await bob.getByRole("button", { name: "Follow" }).click();

  await expect.poll(async () => Math.abs((await getYouTubeState(bob)).currentTime - targetSeconds) <= 5, {
    timeout: 30_000
  }).toBe(true);
  await expect.poll(async () => (await getYouTubeState(bob)).paused, {
    timeout: 30_000
  }).toBe(true);
  await expectNoYouTubePlaybackError(bob);
  await expectNoYouTubePlaybackError(alice);
  expect(await getYouTubeSeekCount(alice)).toBe(0);
  expect(await getYouTubeSeekCount(bob)).toBe(0);

  return { alice, bob };
}

test("syncs a real YouTube video through the YouTube adapter", async ({
  openExternal,
  openIsolatedExternal
}, testInfo) => {
  testInfo.setTimeout(120_000);

  await syncPausedYouTubeVideo({
    openExternal,
    openIsolatedExternal,
    targetSeconds: targetTime,
    url: youtubeTestUrl
  });
});

test("does not crash or spam seeks after a long YouTube seek", async ({
  openExternal,
  openIsolatedExternal
}, testInfo) => {
  testInfo.setTimeout(150_000);

  const { bob } = await syncPausedYouTubeVideo({
    openExternal,
    openIsolatedExternal,
    targetSeconds: longVideoTargetTime,
    url: youtubeTestUrl
  });

  await bob.waitForTimeout(4_000);
  expect(await getYouTubeSeekCount(bob)).toBe(0);
  await expectNoYouTubePlaybackError(bob);
});
