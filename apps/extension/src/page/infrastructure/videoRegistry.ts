import { videoExpiredSeconds } from "../app/config";

export interface VideoModel {
  activatedTime: number;
  duration: number;
  id: string;
  refreshTime: number;
}

export function generateUUID(): string {
  if (crypto.randomUUID !== undefined) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (value) => {
    const random = crypto.getRandomValues(new Uint8Array(1))[0]!;
    return (Number(value) ^ random & 15 >> Number(value) / 4).toString(16);
  });
}

export function isVideoLoaded(video: HTMLVideoElement): boolean {
  try {
    if (Number.isNaN(video.readyState)) {
      return true;
    }
    return video.readyState >= 3;
  } catch {
    return true;
  }
}

export class VideoRegistry {
  private activatedVideo: VideoModel | undefined;
  private readonly videoMap = new Map<string, VideoModel>();

  constructor(private readonly onVideoActivity: () => void) {}

  observe(): void {
    const root = document.body || document.documentElement;
    if (!root) {
      window.setTimeout(() => this.observe(), 500);
      return;
    }

    document.querySelectorAll("video").forEach((video) => this.observeVideo(video));
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => this.observeNode(node));
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  getVideoDom(): HTMLVideoElement | null {
    let selected: HTMLVideoElement | null = null;
    let selectedDuration = -1;
    const now = Date.now() / 1000;

    this.forEachVideo((video) => {
      const model = this.createVideoModel(video);
      this.videoMap.set(model.id, model);
      if (
        this.activatedVideo !== undefined
        && model.id === this.activatedVideo.id
        && this.activatedVideo.activatedTime + videoExpiredSeconds > now
      ) {
        selected = video;
        selectedDuration = Number.MAX_SAFE_INTEGER;
        return;
      }

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > selectedDuration) {
        selected = video;
        selectedDuration = duration;
      }
    });

    return selected;
  }

  private addVideoListener(video: HTMLVideoElement): void {
    if (video.VideoTogetherLiteListenerAdded) {
      return;
    }

    video.VideoTogetherLiteListenerAdded = true;
    const listener = (event: Event) => {
      this.setActivatedVideoDom(event.target as HTMLVideoElement);
      this.onVideoActivity();
    };
    for (const eventName of ["play", "pause", "seeked"]) {
      video.addEventListener(eventName, listener, false);
    }
  }

  private createVideoModel(video: HTMLVideoElement): VideoModel {
    if (video.VideoTogetherVideoId === undefined) {
      video.VideoTogetherVideoId = generateUUID();
    }
    return {
      activatedTime: video.VideoTogetherActivatedTime || 0,
      duration: video.duration,
      id: video.VideoTogetherVideoId,
      refreshTime: Date.now() / 1000
    };
  }

  private forEachVideo(callback: (video: HTMLVideoElement) => void): void {
    document.querySelectorAll("video").forEach((video) => {
      try {
        if (!video.VideoTogetherLiteListenerAdded) {
          this.addVideoListener(video);
        }
        callback(video);
      } catch {
        // Host pages can expose hostile video wrappers; ignore individual failures.
      }
    });
  }

  private observeNode(node: Node): void {
    if (node instanceof HTMLVideoElement) {
      this.observeVideo(node);
      return;
    }

    if (node instanceof Element) {
      node.querySelectorAll("video").forEach((video) => this.observeVideo(video));
    }
  }

  private observeVideo(video: HTMLVideoElement): void {
    this.addVideoListener(video);
    const model = this.createVideoModel(video);
    this.videoMap.set(model.id, model);
  }

  private setActivatedVideoDom(video: HTMLVideoElement): void {
    if (video.VideoTogetherVideoId === undefined) {
      video.VideoTogetherVideoId = generateUUID();
    }
    video.VideoTogetherActivatedTime = Date.now() / 1000;
    this.activatedVideo = this.createVideoModel(video);
  }
}
