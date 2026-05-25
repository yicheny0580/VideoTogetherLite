import { expect, test } from "./helpers/extensionTest";
import {
  createButton,
  exitButton,
  expectNoPanel,
  expectVideoState,
  fillInvite,
  fillNickname,
  getFixtureVideo,
  inviteCodeText,
  joinButton,
  participantCount,
  pickVideoButton,
  pickFirstVideo,
  setFixtureVideo,
  statusText
} from "./helpers/panel";

test("popup enable switch controls fixture injection", async ({ openFixture, openPopup }) => {
  const popup = await openPopup();
  const enabledSwitch = popup.locator("#videoTogetherLiteExtensionSwitch");
  const switchControl = popup.locator("label").filter({ has: enabledSwitch });
  await expect(enabledSwitch).toBeChecked();

  await switchControl.click();
  await expect(enabledSwitch).not.toBeChecked();
  await expect(popup.getByText("Disabled")).toBeVisible();
  const disabledPage = await openFixture("/host", { waitForPanel: false });
  await expectNoPanel(disabledPage);

  await switchControl.click();
  await expect(enabledSwitch).toBeChecked();
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
  await expect(statusText(alice)).toContainText("Sync");
  const inviteCode = await inviteCodeText(alice).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedFixture("/host");
  await fillNickname(bob, "Bob");
  await setFixtureVideo(bob, { currentTime: 0, paused: true, playbackRate: 1 });
  await fillInvite(bob, inviteCode);
  await joinButton(bob).click();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
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
    currentTime: 44,
    paused: false,
    playbackRate: 1.5
  }, 3);
  await expect.poll(async () => (await getFixtureVideo(bob)).currentTime).toBeGreaterThan(44);

  await setFixtureVideo(alice, { currentTime: 50, paused: false, playbackRate: 1.25 });
  await expectVideoState(bob, {
    currentTime: 50,
    paused: false,
    playbackRate: 1.25
  }, 3);

  await setFixtureVideo(alice, { currentTime: 52, paused: true, playbackRate: 1.25 });
  await expectVideoState(bob, {
    currentTime: 52,
    paused: true,
    playbackRate: 1.25
  });

  await bob.reload();
  await expect(bob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await expect(bob.getByRole("button", { name: "Following" })).toBeVisible();

  const bobContext = bob.context();
  const bobUrl = bob.url();
  await bob.close();
  const reopenedBob = await bobContext.newPage();
  await reopenedBob.goto(bobUrl);
  await expect(reopenedBob.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await expect(reopenedBob.getByRole("button", { name: "Following" })).toBeVisible();

  await exitButton(reopenedBob).click();
  await expect(createButton(reopenedBob)).toBeVisible();
  expect(await reopenedBob.evaluate(() => sessionStorage.getItem("VideoTogetherLiteRoomCode")))
    .toBeNull();
});

test("keeps focus explicit and reports invalid invite or missing videos", async ({ openFixture }) => {
  const alice = await openFixture("/host");
  await fillNickname(alice, "Alice");
  await createButton(alice).click();
  await expect(alice.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
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
