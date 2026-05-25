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
  await expect(popup.getByText("Enabled", { exact: true })).toBeVisible();
  const enabledPage = await openFixture("/host");
  await expectNoPanel(enabledPage);
});

test("creates a participant room and follows an explicitly focused video", async ({
  openFixture,
  openIsolatedFixture,
  openPopupForPage
}) => {
  const alice = await openFixture("/host");
  const alicePopup = await openPopupForPage(alice);
  await fillNickname(alicePopup, "Alice");
  await setFixtureVideo(alice, { currentTime: 12, paused: true, playbackRate: 1.25 });
  await createButton(alicePopup).click();
  await expect(alicePopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await pickFirstVideo(alicePopup, alice);
  await expect(statusText(alicePopup)).toContainText("Sync");
  const inviteCode = await inviteCodeText(alicePopup).innerText();
  expect(inviteCode).toContain(".");

  const bob = await openIsolatedFixture("/host");
  const bobPopup = await openPopupForPage(bob);
  await fillNickname(bobPopup, "Bob");
  await setFixtureVideo(bob, { currentTime: 0, paused: true, playbackRate: 1 });
  await fillInvite(bobPopup, inviteCode);
  await joinButton(bobPopup).click();
  await expect(bobPopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await bobPopup.getByRole("button", { name: "Follow" }).click();
  await expect(participantCount(alicePopup)).toContainText("2");
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
  await bobPopup.close();
  const reloadedBobPopup = await openPopupForPage(bob);
  await expect(reloadedBobPopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await expect(reloadedBobPopup.getByRole("button", { name: "Stop follow" })).toBeVisible();

  const bobContext = bob.context();
  const bobUrl = bob.url();
  await reloadedBobPopup.close();
  await bob.close();
  const reopenedBob = await bobContext.newPage();
  await reopenedBob.goto(bobUrl);
  const reopenedBobPopup = await openPopupForPage(reopenedBob);
  await expect(reopenedBobPopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await expect(reopenedBobPopup.getByRole("button", { name: "Stop follow" })).toBeVisible();

  await reopenedBobPopup.getByRole("button", { name: "Stop follow" }).click();
  await expect(reopenedBobPopup.getByRole("button", { name: "Follow" })).toBeVisible();
  await expect(reopenedBobPopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  await setFixtureVideo(alice, { currentTime: 70, paused: true, playbackRate: 1.25 });
  await reopenedBob.waitForTimeout(3_000);
  expect(Math.abs((await getFixtureVideo(reopenedBob)).currentTime - 70)).toBeGreaterThan(1.5);

  await exitButton(reopenedBobPopup).click();
  await expect(createButton(reopenedBobPopup)).toBeVisible();
  expect(await reopenedBob.evaluate(() => sessionStorage.getItem("VideoTogetherLiteRoomCode")))
    .toBeNull();
});

test("keeps focus explicit and reports invalid invite or missing videos", async ({ openFixture, openPopupForPage }) => {
  const alice = await openFixture("/host");
  const alicePopup = await openPopupForPage(alice);
  await fillNickname(alicePopup, "Alice");
  await createButton(alicePopup).click();
  await expect(alicePopup.locator("#videoTogetherLiteRoomCodeText")).toBeVisible();
  const roomCode = (await inviteCodeText(alicePopup).innerText()).split(".")[0]!;

  const bob = await openFixture("/member");
  const bobPopup = await openPopupForPage(bob);
  await fillNickname(bobPopup, "Bob");
  await fillInvite(bobPopup, `${roomCode}.badsecret`);
  await joinButton(bobPopup).click();
  await expect(statusText(bobPopup)).toContainText("Wrong invite code");
  await expect(joinButton(bobPopup)).toBeVisible();

  const noVideo = await openFixture("/no-video");
  const noVideoPopup = await openPopupForPage(noVideo);
  await fillNickname(noVideoPopup, "No Video");
  await createButton(noVideoPopup).click();
  await pickVideoButton(noVideoPopup).click();
  await expect(statusText(noVideoPopup)).toContainText("No videos found");
});
