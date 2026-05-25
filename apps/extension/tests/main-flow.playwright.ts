import { expect, test } from "./helpers/extensionTest";
import {
  createButton,
  exitButton,
  expectNoPanel,
  expectVideoState,
  fillLobby,
  joinButton,
  memberCount,
  roleText,
  setFixtureVideo,
  statusText,
  uniqueRoomName
} from "./helpers/panel";

test("popup enable switch controls fixture injection", async ({ openFixture, openPopup }) => {
  const popup = await openPopup();
  const enabledSwitch = popup.locator("#videoTogetherLiteExtensionSwitch");
  await expect(enabledSwitch).toBeChecked();

  await enabledSwitch.setChecked(false, { force: true });
  await expect(popup.getByText("Disabled")).toBeVisible();
  const disabledPage = await openFixture("/host", { waitForPanel: false });
  await expectNoPanel(disabledPage);

  await enabledSwitch.setChecked(true, { force: true });
  await expect(popup.getByText("Enabled")).toBeVisible();
  const enabledPage = await openFixture("/host");
  await expect(enabledPage.locator("#videoTogetherLiteFlyPanel")).toBeVisible();
});

test("syncs host and member through the browser extension flow", async ({ openFixture }) => {
  const roomName = uniqueRoomName("main-flow");
  const password = "main-password";
  const host = await openFixture("/host");
  await setFixtureVideo(host, { currentTime: 12, paused: true, playbackRate: 1.25 });
  await fillLobby(host, roomName, password);
  await createButton(host).click();

  await expect(roleText(host)).toHaveText("Host");
  await expect(statusText(host)).toContainText("Sync");
  await expect(exitButton(host)).toBeVisible();

  const member = await openFixture("/host");
  await setFixtureVideo(member, { currentTime: 0, paused: true, playbackRate: 1 });
  await fillLobby(member, roomName, password);
  await joinButton(member).click();

  await expect(roleText(member)).toHaveText("Member");
  await expect(member.locator("#videoTogetherLiteRoomNameInput")).toHaveValue(roomName);
  await expect(statusText(member)).toContainText("Sync");
  await expect(memberCount(host)).toContainText("2");
  await expectVideoState(member, {
    currentTime: 12,
    paused: true,
    playbackRate: 1.25
  });

  await setFixtureVideo(host, { currentTime: 42, paused: true, playbackRate: 1.5 });
  await expectVideoState(member, {
    currentTime: 42,
    paused: true,
    playbackRate: 1.5
  });

  await setFixtureVideo(host, { currentTime: 44, paused: false, playbackRate: 1.5 });
  await expectVideoState(member, {
    paused: false,
    playbackRate: 1.5
  });

  await setFixtureVideo(host, { currentTime: 52, paused: true, playbackRate: 1.5 });
  await expectVideoState(member, {
    paused: true,
    playbackRate: 1.5
  });

  await member.reload();
  await expect(roleText(member)).toHaveText("Member");
  await expect(member.locator("#videoTogetherLiteRoomNameInput")).toHaveValue(roomName);

  await exitButton(member).click();
  await expect(createButton(member)).toBeVisible();
  expect(await member.evaluate(() => sessionStorage.getItem("VideoTogetherLiteRoomName")))
    .toBeNull();
});

test("shows browser-flow errors for wrong passwords and missing videos", async ({ openFixture }) => {
  const roomName = uniqueRoomName("error-flow");
  const password = "correct-password";
  const host = await openFixture("/host");
  await setFixtureVideo(host, { currentTime: 5, paused: true, playbackRate: 1 });
  await fillLobby(host, roomName, password);
  await createButton(host).click();
  await expect(roleText(host)).toHaveText("Host");

  const wrongPasswordMember = await openFixture("/member");
  await fillLobby(wrongPasswordMember, roomName, "wrong-password");
  await joinButton(wrongPasswordMember).click();
  await expect(statusText(wrongPasswordMember)).toContainText("Wrong Password");
  await expect(joinButton(wrongPasswordMember)).toBeVisible();

  const noVideo = await openFixture("/no-video");
  await fillLobby(noVideo, uniqueRoomName("no-video"), "no-video-password");
  await createButton(noVideo).click();
  await expect(statusText(noVideo)).toContainText("No video in this page");
});
