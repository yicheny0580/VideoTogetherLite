import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelCommand } from "../bridge/panelBridge";
import type { PanelState } from "../page/app/panelState";
import { PopupApp } from "./PopupApp";

const mocks = vi.hoisted(() => ({
  getValue: vi.fn(),
  sendPanelCommand: vi.fn()
}));

vi.mock("./storage", () => ({
  getValue: mocks.getValue
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
      return undefined;
    });
    mocks.sendPanelCommand.mockResolvedValue({
      id: "state",
      ok: true,
      source: "VideoTogetherLiteContent",
      state: roomState()
    });
  });

  it("renders unavailable page errors", async () => {
    mocks.sendPanelCommand.mockResolvedValue({
      error: "No active web page found",
      id: "state",
      ok: false,
      source: "VideoTogetherLiteContent"
    });

    render(<PopupApp />);

    expect(await screen.findByText("Page unavailable")).toBeVisible();
    expect(screen.getByText("Open a supported video page to control a room.")).toBeVisible();
    expect(screen.getByText("Connection issue")).toBeVisible();
    expect(screen.getByText("No active web page found")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders room controls from the active tab", async () => {
    render(<PopupApp />);

    expect(await screen.findByText("ROOM", { selector: "#videoTogetherLiteRoomCodeText" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop follow" })).toBeVisible();
    expect(screen.getByText("Shared")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders danger status as an alert", async () => {
    mocks.sendPanelCommand.mockResolvedValue({
      id: "state",
      ok: true,
      source: "VideoTogetherLiteContent",
      state: roomState({
        statusText: "Wrong invite code",
        statusTone: "danger"
      })
    });

    render(<PopupApp />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong invite code");
  });

  it("does not render an empty status alert", async () => {
    mocks.sendPanelCommand.mockResolvedValue({
      id: "state",
      ok: true,
      source: "VideoTogetherLiteContent",
      state: roomState({ statusText: "" })
    });

    render(<PopupApp />);

    expect(await screen.findByText("ROOM", { selector: "#videoTogetherLiteRoomCodeText" })).toBeVisible();
    expect(document.querySelector("#videoTogetherLiteStatusText")).not.toBeInTheDocument();
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
    expect(await screen.findByText("ROOM", { selector: "#videoTogetherLiteRoomCodeText" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Follow" })).toBeVisible();
  });

  it("renders command errors while preserving room controls", async () => {
    mocks.sendPanelCommand.mockImplementation(async (command: PanelCommand) => {
      if (command.type === "stopFollow") {
        return {
          error: "VideoTogether Lite is not ready on this page",
          id: "state",
          ok: false,
          source: "VideoTogetherLiteContent"
        };
      }
      return {
        id: "state",
        ok: true,
        source: "VideoTogetherLiteContent",
        state: roomState()
      };
    });

    render(<PopupApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Stop follow" }));

    expect(await screen.findByText("Connection issue")).toBeVisible();
    expect(screen.getByText("VideoTogether Lite is not ready on this page")).toBeVisible();
    expect(screen.getByText("ROOM", { selector: "#videoTogetherLiteRoomCodeText" })).toBeVisible();
  });
});
