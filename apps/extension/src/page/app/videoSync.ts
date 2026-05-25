import { calculateRealCurrent, type Room } from "@videotogether/shared";

export async function syncVideoToRoom(
  room: Room,
  video: HTMLVideoElement,
  localTimestamp: number,
  manualPlayMessage: string
): Promise<void> {
  const realCurrent = calculateRealCurrent(room, localTimestamp);
  if (!room.paused && Math.abs(video.currentTime - realCurrent) > 1) {
    video.currentTime = realCurrent;
  } else if (room.paused && Math.abs(video.currentTime - room.currentTime) > 0.1) {
    video.currentTime = room.currentTime;
  }

  if (video.paused !== room.paused) {
    if (room.paused) {
      video.pause();
    } else {
      await video.play();
      if (video.paused) {
        throw new Error(manualPlayMessage);
      }
    }
  }

  if (video.playbackRate !== room.playbackRate) {
    try {
      video.playbackRate = Number.parseFloat(String(room.playbackRate));
    } catch {
      // Some hosts block playbackRate updates.
    }
  }
}
