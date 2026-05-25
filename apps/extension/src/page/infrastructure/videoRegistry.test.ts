import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoRegistry } from "./videoRegistry";

afterEach(() => {
  document.body.replaceChildren();
});

function videoWithRect({
  display = "",
  height,
  left = 0,
  top = 0,
  width
}: {
  display?: string;
  height: number;
  left?: number;
  top?: number;
  width: number;
}): HTMLVideoElement {
  const video = document.createElement("video");
  video.style.display = display;
  video.getBoundingClientRect = vi.fn(() => ({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  }));
  document.body.append(video);
  return video;
}

describe("VideoRegistry", () => {
  it("uses the visible IYF player instead of hidden helper videos", () => {
    videoWithRect({ display: "none", height: 0, width: 0 });
    const mainVideo = videoWithRect({ height: 473, left: 64, top: 64, width: 840 });
    mainVideo.id = "video_player";
    videoWithRect({ height: 1, top: 675, width: 1 });
    const registry = new VideoRegistry(() => undefined);

    expect(registry.getPlaybackTargetVideoDom()).toBe(mainVideo);
    expect(registry.focusPlaybackTargetVideo()).toMatchObject({
      id: mainVideo.VideoTogetherLiteVideoId,
      visible: true
    });
  });
});

