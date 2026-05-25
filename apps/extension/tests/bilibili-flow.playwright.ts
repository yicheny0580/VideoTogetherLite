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

const bilibiliTestUrl = "https://www.bilibili.com/video/BV1bZ4y1r7na/";
const initialTargetTime = 18;
const updatedTargetTime = 24;

interface BilibiliPagePlayer {
  getCurrentTime?: () => number;
  getDuration?: () => number;
  isPaused?: () => boolean;
  mediaElement?: () => HTMLMediaElement | null;
  pause?: () => void;
  seek?: (seconds: number) => void;
}

interface BilibiliPageWindow extends Window {
  __videoTogetherLiteBilibiliSeekCount?: number;
  player?: BilibiliPagePlayer;
}

interface BilibiliState {
  currentTime: number;
  duration: number;
  errorText: string;
  paused: boolean;
}

async function waitForBilibiliPlayer(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      const pageWindow = window as BilibiliPageWindow;
      const video = document.querySelector("video");
      const player = pageWindow.player;
      return Boolean(
        video instanceof HTMLVideoElement
        && player
        && player.mediaElement?.() === video
        && typeof player.getCurrentTime === "function"
        && typeof player.getDuration === "function"
        && typeof player.pause === "function"
        && typeof player.seek === "function"
      );
    } catch {
      return false;
    }
  }, null, { timeout: 60_000 });

  await expect.poll(async () => (await getBilibiliState(page)).duration > 0, {
    timeout: 60_000
  }).toBe(true);
}

async function getBilibiliState(page: Page): Promise<BilibiliState> {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("Bilibili video element is unavailable.");
    }

    const pageWindow = window as BilibiliPageWindow;
    const player = pageWindow.player;
    const finiteNumber = (value: unknown): number | null => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : null;
    };
    const visibleError = Array.from(document.querySelectorAll(
      ".bpx-player-error-sign, .bilibili-player-video-error"
    )).find((element) => {
      if (!(element instanceof HTMLElement) || element.textContent?.trim() === "") {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });

    return {
      currentTime: finiteNumber(player?.getCurrentTime?.()) ?? finiteNumber(video.currentTime) ?? 0,
      duration: finiteNumber(player?.getDuration?.()) ?? finiteNumber(video.duration) ?? 0,
      errorText: visibleError?.textContent?.trim() ?? "",
      paused: Boolean(player?.isPaused?.()) || video.paused
    };
  });
}

async function tryGetBilibiliState(page: Page): Promise<BilibiliState | null> {
  try {
    return await getBilibiliState(page);
  } catch {
    return null;
  }
}

async function setBilibiliPausedTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((targetSeconds) => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error("Bilibili video element is unavailable.");
    }
    const player = (window as BilibiliPageWindow).player;

    player?.pause?.();
    video.pause();
    if (typeof player?.seek === "function") {
      player.seek(targetSeconds);
    } else {
      video.currentTime = targetSeconds;
    }
    player?.pause?.();
    video.pause();
  }, seconds);

  await expect.poll(async () => {
    const state = await tryGetBilibiliState(page);
    return state !== null && state.paused && Math.abs(state.currentTime - seconds) <= 2;
  }, {
    timeout: 30_000
  }).toBe(true);
}

async function waitForBilibiliTime(
  page: Page,
  seconds: number,
  timeout = 30_000,
  tolerance = 2
): Promise<void> {
  await expect.poll(async () => {
    const state = await tryGetBilibiliState(page);
    return state !== null && Math.abs(state.currentTime - seconds) <= tolerance;
  }, { timeout }).toBe(true);
}

async function seekBilibiliPlayer(page: Page, seconds: number): Promise<void> {
  await page.evaluate((targetSeconds) => {
    const video = document.querySelector("video");
    const player = (window as BilibiliPageWindow).player;
    if (!(video instanceof HTMLVideoElement) || typeof player?.seek !== "function") {
      throw new Error("Bilibili player seek API is unavailable.");
    }

    player.seek(targetSeconds);
    player.pause?.();
    video.pause();
  }, seconds);
}

async function expectNoBilibiliPlaybackError(page: Page): Promise<void> {
  await expect.poll(async () => (await getBilibiliState(page)).errorText, {
    timeout: 10_000
  }).toBe("");
}

async function installBilibiliSeekCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pageWindow = window as BilibiliPageWindow;
    const player = pageWindow.player;
    if (!player || typeof player.seek !== "function") {
      pageWindow.__videoTogetherLiteBilibiliSeekCount = 0;
      return;
    }
    const originalSeek = player.seek.bind(player);
    pageWindow.__videoTogetherLiteBilibiliSeekCount = 0;
    player.seek = (seconds) => {
      pageWindow.__videoTogetherLiteBilibiliSeekCount =
        (pageWindow.__videoTogetherLiteBilibiliSeekCount ?? 0) + 1;
      return originalSeek(seconds);
    };
  });
}

async function getBilibiliSeekCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as BilibiliPageWindow).__videoTogetherLiteBilibiliSeekCount ?? 0);
}

async function resetBilibiliSeekCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as BilibiliPageWindow).__videoTogetherLiteBilibiliSeekCount = 0;
  });
}

async function syncPausedBilibiliVideo({
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
  await waitForBilibiliPlayer(alice);
  await fillNickname(alice, "Alice");
  await createButton(alice).click();
  await expect(alice.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(alice);
  await expect(alice.locator(".vtl-participant-video").filter({ hasText: "Alice" })).toBeVisible({
    timeout: 30_000
  });
  await setBilibiliPausedTime(alice, targetSeconds);
  await expect(statusText(alice)).toContainText("Sync");
  await expectNoBilibiliPlaybackError(alice);
  const inviteCode = await inviteCodeText(alice).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedExternal(url);
  await waitForBilibiliPlayer(bob);
  await installBilibiliSeekCounter(bob);
  await resetBilibiliSeekCount(bob);
  await fillNickname(bob, "Bob");
  await fillInvite(bob, inviteCode);
  await joinButton(bob).click();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await bob.getByRole("button", { name: "Follow" }).click();

  await waitForBilibiliTime(bob, targetSeconds, 45_000, 3);
  await expectNoBilibiliPlaybackError(bob);
  await expectNoBilibiliPlaybackError(alice);
  expect(await getBilibiliSeekCount(bob)).toBeGreaterThanOrEqual(1);

  return { alice, bob };
}

test("syncs a real Bilibili video through the Bilibili adapter", async ({
  openExternal,
  openIsolatedExternal
}, testInfo) => {
  testInfo.setTimeout(150_000);

  await syncPausedBilibiliVideo({
    openExternal,
    openIsolatedExternal,
    targetSeconds: initialTargetTime,
    url: bilibiliTestUrl
  });
});

test("keeps a followed Bilibili room synced after host seeks", async ({
  openExternal,
  openIsolatedExternal
}, testInfo) => {
  testInfo.setTimeout(180_000);

  const { alice, bob } = await syncPausedBilibiliVideo({
    openExternal,
    openIsolatedExternal,
    targetSeconds: initialTargetTime,
    url: bilibiliTestUrl
  });

  await resetBilibiliSeekCount(bob);
  await seekBilibiliPlayer(alice, updatedTargetTime);
  await waitForBilibiliTime(alice, updatedTargetTime);
  await waitForBilibiliTime(bob, updatedTargetTime, 45_000, 3);
  await expectNoBilibiliPlaybackError(alice);
  await expectNoBilibiliPlaybackError(bob);
  expect(await getBilibiliSeekCount(bob)).toBeGreaterThanOrEqual(1);
});
