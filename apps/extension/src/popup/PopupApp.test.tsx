import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelCommand } from "../bridge/panelBridge";
import type { PanelState } from "../page/app/panelState";
import { PopupApp } from "./PopupApp";
import { getValue } from "./storage";

const mocks = vi.hoisted(() => ({
  getValue: vi.fn(),
  sendPanelCommand: vi.fn(),
  setValue: vi.fn()
}));

vi.mock("./storage", () => ({
  getValue: mocks.getValue,
  setValue: mocks.setValue
}));

vi.mock("./activeTabBridge", () => ({
  sendPanelCommand: mocks.sendPanelCommand
}));

function roomState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    focusedVideo: null,
    followUserId: "alice",
    inRoom: true,
    inviteCode: "ROOM.secret",
    nickname: "Bob",
    participantCount: 2,
    participants: [{
      currentTime: 12,
      duration: 90,
      isFollowing: true,
      isLocal: false,
      nickname: "Alice",
      paused: true,
      sharing: true,
      title: "Shared",
      url: "https://example.com/watch",
      urlHost: "example.com",
      userId: "alice"
    }],
    pickingVideo: false,
    roomCode: "ROOM",
    sharing: false,
    statusText: "Sync",
    statusTone: "success",
    ...overrides
  };
}

describe("PopupApp", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.getValue.mockImplementation(async (key: string) => {
      if (key === "DisplayLanguage") {
        return "en-us";
      }
      return true;
    });
    mocks.sendPanelCommand.mockResolvedValue({
      id: "state",
      ok: true,
      source: "VideoTogetherLiteContent",
      state: roomState()
    });
    mocks.setValue.mockResolvedValue(undefined);
  });

  it("renders persisted disabled state", async () => {
    vi.mocked(getValue).mockImplementation(async (key: string) => {
      if (key === "videoTogetherLiteEnabled") {
        return false;
      }
      if (key === "DisplayLanguage") {
        return "en-us";
      }
      return undefined;
    });

    render(<PopupApp />);

    expect(await screen.findByText("Disabled")).toBeTruthy();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("renders room controls from the active tab", async () => {
    render(<PopupApp />);

    expect(await screen.findByText("ROOM")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop follow" })).toBeVisible();
    expect(screen.getByText("Shared")).toBeVisible();
  });

  it("sends stop follow without leaving the room", async () => {
    mocks.sendPanelCommand.mockImplementation(async (command: PanelCommand) => ({
      id: "state",
      ok: true,
      source: "VideoTogetherLiteContent",
      state: roomState(
        command.type === "stopFollow"
          ? {
            followUserId: "",
            participants: [{
              ...roomState().participants[0]!,
              isFollowing: false
            }]
          }
          : {}
      )
    }));

    render(<PopupApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Stop follow" }));

    await waitFor(() => {
      expect(mocks.sendPanelCommand).toHaveBeenCalledWith({ type: "stopFollow" });
    });
    expect(await screen.findByText("ROOM")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Follow" })).toBeVisible();
  });
});
