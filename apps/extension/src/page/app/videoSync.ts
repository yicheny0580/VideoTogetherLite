import { calculateRealCurrent, type SharedVideoState } from "@videotogetherlite/shared";

export async function syncVideoToRoom(
  sharedVideo: SharedVideoState,
  video: HTMLVideoElement,
  localTimestamp: number,
  manualPlayMessage: string
): Promise<void> {
  const realCurrent = calculateRealCurrent(sharedVideo, localTimestamp);
  if (!sharedVideo.paused && Math.abs(video.currentTime - realCurrent) > 1) {
    video.currentTime = realCurrent;
  } else if (sharedVideo.paused && Math.abs(video.currentTime - sharedVideo.currentTime) > 0.1) {
    video.currentTime = sharedVideo.currentTime;
  }

  if (video.paused !== sharedVideo.paused) {
    if (sharedVideo.paused) {
      video.pause();
    } else {
      await video.play();
      if (video.paused) {
        throw new Error(manualPlayMessage);
      }
    }
  }

  if (video.playbackRate !== sharedVideo.playbackRate) {
    try {
      video.playbackRate = Number.parseFloat(String(sharedVideo.playbackRate));
    } catch {
      // Some hosts block playbackRate updates.
    }
  }
}
