import { expect, test } from "./helpers/extensionTest";
import {
  createButton,
  exitButton,
  expectNoPanel,
  expectVideoState,
  fillInvite,
  fillNickname,
  inviteCodeText,
  joinButton,
  participantCount,
  pickVideoButton,
  pickFirstVideo,
  setFixtureVideo,
  shareToggle,
  statusText
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

test("creates a participant room and follows an explicitly focused video", async ({ openFixture, openIsolatedFixture }) => {
  const alice = await openFixture("/host");
  await fillNickname(alice, "Alice");
  await setFixtureVideo(alice, { currentTime: 12, paused: true, playbackRate: 1.25 });
  await createButton(alice).click();
  await expect(alice.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(alice);
  await shareToggle(alice).setChecked(true);
  await expect(statusText(alice)).toContainText("Sync");
  const inviteCode = await inviteCodeText(alice).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedFixture("/host");
  await fillNickname(bob, "Bob");
  await setFixtureVideo(bob, { currentTime: 0, paused: true, playbackRate: 1 });
  await fillInvite(bob, inviteCode);
  await joinButton(bob).click();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(bob);
  await bob.getByRole("button", { name: "Follow" }).click();
  await expect(participantCount(alice)).toContainText("2");
  await expectVideoState(bob, {
    currentTime: 12,
    paused: true,
    playbackRate: 1.25
  });

  await setFixtureVideo(alice, { currentTime: 42, paused: true, playbackRate: 1.5 });
  await expectVideoState(bob, {
    currentTime: 42,
    paused: true,
    playbackRate: 1.5
  });

  await setFixtureVideo(alice, { currentTime: 44, paused: false, playbackRate: 1.5 });
  await expectVideoState(bob, {
    paused: false,
    playbackRate: 1.5
  });

  await bob.reload();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();

  await exitButton(bob).click();
  await expect(createButton(bob)).toBeVisible();
  expect(await bob.evaluate(() => sessionStorage.getItem("VideoTogetherLiteRoomCode")))
    .toBeNull();
});

test("keeps focus explicit and reports invalid invite or missing videos", async ({ openFixture }) => {
  const alice = await openFixture("/host");
  await fillNickname(alice, "Alice");
  await createButton(alice).click();
  await expect(alice.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await shareToggle(alice).click();
  await expect(statusText(alice)).toContainText("Pick a video before sharing");
  const roomCode = (await inviteCodeText(alice).innerText()).split(".")[0]!;

  const bob = await openFixture("/member");
  await fillNickname(bob, "Bob");
  await fillInvite(bob, `${roomCode}.badsecret`);
  await joinButton(bob).click();
  await expect(statusText(bob)).toContainText("Wrong invite code");
  await expect(joinButton(bob)).toBeVisible();

  const noVideo = await openFixture("/no-video");
  await fillNickname(noVideo, "No Video");
  await createButton(noVideo).click();
  await pickVideoButton(noVideo).click();
  await expect(statusText(noVideo)).toContainText("No videos found");
});
