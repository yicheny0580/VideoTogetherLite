import { expect, type Locator, type Page } from "@playwright/test";

export interface FixtureVideoState {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  readyState: number;
}

interface FixtureVideoController {
  emitActivity: () => void;
  getVideo: () => FixtureVideoState;
  setVideo: (next: Partial<FixtureVideoState>) => Promise<FixtureVideoState>;
}

declare global {
  interface Window {
    __videoTogetherLiteFixture?: FixtureVideoController;
  }
}

export function createButton(page: Page): Locator {
  return page.locator("#videoTogetherLiteCreateButton");
}

export function exitButton(page: Page): Locator {
  return page.locator("#videoTogetherLiteExitButton");
}

export function inviteCodeText(page: Page): Locator {
  return page.locator("#videoTogetherLiteInviteCodeText");
}

export function joinButton(page: Page): Locator {
  return page.locator("#videoTogetherLiteJoinButton");
}

export function participantCount(page: Page): Locator {
  return page.locator("#videoTogetherLiteParticipantCount");
}

export function pickVideoButton(page: Page): Locator {
  return page.locator("#videoTogetherLitePickVideoButton");
}

export function statusText(page: Page): Locator {
  return page.locator("#videoTogetherLiteStatusText");
}

export async function expectNoPanel(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  await expect(page.locator("#VideoTogetherLiteWrapper")).toHaveCount(0);
  await expect(page.locator("#videoTogetherLiteFlyPanel")).toHaveCount(0);
  await expect(page.locator("#videoTogetherLiteLoading")).toHaveCount(0);
}

export async function expectVideoState(
  page: Page,
  expected: Partial<FixtureVideoState>,
  tolerance = 1.5
): Promise<void> {
  if (expected.currentTime !== undefined) {
    await expect.poll(async () => {
      const video = await getFixtureVideo(page);
      return Math.abs(video.currentTime - expected.currentTime!) <= tolerance;
    }).toBe(true);
  }
  if (expected.paused !== undefined) {
    await expect.poll(async () => {
      const video = await getFixtureVideo(page);
      return video.paused;
    }).toBe(expected.paused);
  }
  if (expected.playbackRate !== undefined) {
    await expect.poll(async () => {
      const video = await getFixtureVideo(page);
      return video.playbackRate;
    }).toBe(expected.playbackRate);
  }
}

export async function fillInvite(page: Page, inviteCode: string): Promise<void> {
  await page.locator("#videoTogetherLiteInviteCodeInput").fill(inviteCode);
}

export async function fillNickname(page: Page, nickname: string): Promise<void> {
  await page.locator("#videoTogetherLiteNicknameInput").fill(nickname);
  await page.locator("#videoTogetherLiteNicknameInput").blur();
}

export async function getFixtureVideo(page: Page): Promise<FixtureVideoState> {
  return page.evaluate(() => {
    const fixture = window.__videoTogetherLiteFixture;
    if (!fixture) {
      throw new Error("Fixture video controller is unavailable.");
    }
    return fixture.getVideo();
  });
}

export async function pickFirstVideo(controlPage: Page, targetPage = controlPage): Promise<void> {
  await pickVideoButton(controlPage).click();
  await targetPage.getByText("Use this video").click();
  if (targetPage !== controlPage) {
    await controlPage.bringToFront();
  }
}

export async function setFixtureVideo(
  page: Page,
  state: Partial<FixtureVideoState>
): Promise<void> {
  await page.evaluate(async (next) => {
    const fixture = window.__videoTogetherLiteFixture;
    if (!fixture) {
      throw new Error("Fixture video controller is unavailable.");
    }
    await fixture.setVideo(next);
  }, state);
}
