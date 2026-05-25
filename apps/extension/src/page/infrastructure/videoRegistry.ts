export interface FocusableVideo {
  currentTime: number;
  duration: number;
  id: string;
  paused: boolean;
  title: string;
  visible: boolean;
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

function videoTitle(video: HTMLVideoElement): string {
  return video.getAttribute("aria-label")
    || video.getAttribute("title")
    || document.title
    || "Untitled video";
}

function isVisibleVideo(video: HTMLVideoElement): boolean {
  const rect = video.getBoundingClientRect();
  const style = window.getComputedStyle(video);
  return rect.width >= 40
    && rect.height >= 30
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth
    && style.display !== "none"
    && style.visibility !== "hidden";
}

export class VideoRegistry {
  private focusedVideoId = "";
  private observer: MutationObserver | null = null;
  private pickerCleanup: (() => void) | null = null;

  constructor(private readonly onVideoActivity: () => void) {}

  observe(): void {
    const root = document.body || document.documentElement;
    if (!root) {
      window.setTimeout(() => this.observe(), 500);
      return;
    }

    document.querySelectorAll("video").forEach((video) => this.observeVideo(video));
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => this.observeNode(node));
      }
    });
    this.observer.observe(root, { childList: true, subtree: true });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.cancelPicker();
  }

  cancelPicker(): void {
    this.pickerCleanup?.();
    this.pickerCleanup = null;
  }

  clearFocus(): void {
    this.focusedVideoId = "";
  }

  focusVideo(id: string): FocusableVideo | null {
    const video = this.getVideoDom(id);
    if (video === null) {
      return null;
    }
    this.focusedVideoId = id;
    return this.toSummary(video);
  }

  getFocusedVideoId(): string {
    return this.focusedVideoId;
  }

  getFocusedVideoSummary(): FocusableVideo | null {
    const video = this.getVideoDom();
    return video === null ? null : this.toSummary(video);
  }

  getPlaybackTargetVideoDom(): HTMLVideoElement | null {
    const focusedVideo = this.getVideoDom();
    if (focusedVideo !== null) {
      return focusedVideo;
    }

    let firstVideo: HTMLVideoElement | null = null;
    let largestVisibleVideo: HTMLVideoElement | null = null;
    let largestVisibleArea = 0;
    this.forEachVideo((video) => {
      firstVideo ??= video;
      if (!isVisibleVideo(video)) {
        return;
      }
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > largestVisibleArea) {
        largestVisibleArea = area;
        largestVisibleVideo = video;
      }
    });

    return largestVisibleVideo ?? firstVideo;
  }

  getVideoDom(id = this.focusedVideoId): HTMLVideoElement | null {
    if (id === "") {
      return null;
    }
    let selected: HTMLVideoElement | null = null;
    this.forEachVideo((video) => {
      if (video.VideoTogetherLiteVideoId === id) {
        selected = video;
      }
    });
    return selected;
  }

  listVideos(): FocusableVideo[] {
    const videos: FocusableVideo[] = [];
    this.forEachVideo((video) => videos.push(this.toSummary(video)));
    return videos;
  }

  startPicker(onPick: (video: FocusableVideo) => void, onCancel: () => void): boolean {
    this.cancelPicker();
    const candidates = this.getCandidateVideos();
    if (candidates.length === 0) {
      return false;
    }

    const previousStyles = new Map<HTMLVideoElement, { outline: string; outlineOffset: string }>();
    const badges: HTMLButtonElement[] = [];
    const candidateIds = new Set(candidates.map((video) => this.ensureVideoId(video)));

    const highlight = (video: HTMLVideoElement, active: boolean) => {
      video.style.outline = active ? "3px solid #06b6d4" : "2px solid #0891b2";
      video.style.outlineOffset = "3px";
    };

    for (const video of candidates) {
      previousStyles.set(video, {
        outline: video.style.outline,
        outlineOffset: video.style.outlineOffset
      });
      highlight(video, false);
      video.addEventListener("mouseenter", onMouseEnter, true);
      video.addEventListener("mouseleave", onMouseLeave, true);

      const badge = document.createElement("button");
      badge.type = "button";
      badge.textContent = "Use this video";
      badge.dataset.vtlVideoId = this.ensureVideoId(video);
      badge.style.cssText = [
        "position: fixed",
        "z-index: 2147483647",
        "border: 0",
        "border-radius: 999px",
        "background: #0891b2",
        "color: #ffffff",
        "font: 600 13px/1.2 Arial, sans-serif",
        "padding: 8px 10px",
        "box-shadow: 0 10px 30px rgba(0,0,0,.24)",
        "cursor: pointer"
      ].join(";");
      badge.addEventListener("mouseenter", () => highlight(video, true));
      badge.addEventListener("mouseleave", () => highlight(video, false));
      document.documentElement.appendChild(badge);
      badges.push(badge);
    }

    const updateBadges = () => {
      for (const badge of badges) {
        const video = candidates.find((candidate) => candidate.VideoTogetherLiteVideoId === badge.dataset.vtlVideoId);
        if (!video || !isVisibleVideo(video)) {
          badge.hidden = true;
          continue;
        }
        const rect = video.getBoundingClientRect();
        badge.hidden = false;
        badge.style.left = `${Math.max(12, rect.left + 12)}px`;
        badge.style.top = `${Math.max(12, rect.top + 12)}px`;
      }
    };

    const pickVideo = (video: HTMLVideoElement, event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      this.focusedVideoId = this.ensureVideoId(video);
      const summary = this.toSummary(video);
      this.stopPicker(previousStyles, badges, onMouseEnter, onMouseLeave, onClick, onKeyDown, updateBadges);
      onPick(summary);
    };

    function onMouseEnter(event: Event): void {
      highlight(event.currentTarget as HTMLVideoElement, true);
    }

    function onMouseLeave(event: Event): void {
      highlight(event.currentTarget as HTMLVideoElement, false);
    }

    const onClick = (event: MouseEvent) => {
      const badge = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-vtl-video-id]")
        : null;
      if (badge?.dataset.vtlVideoId) {
        const video = candidates.find((candidate) => candidate.VideoTogetherLiteVideoId === badge.dataset.vtlVideoId);
        if (video) {
          pickVideo(video, event);
        }
        return;
      }

      const video = event.composedPath().find((node): node is HTMLVideoElement => node instanceof HTMLVideoElement);
      if (video && candidateIds.has(this.ensureVideoId(video))) {
        pickVideo(video, event);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      this.stopPicker(previousStyles, badges, onMouseEnter, onMouseLeave, onClick, onKeyDown, updateBadges);
      onCancel();
    };

    updateBadges();
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", updateBadges, true);
    window.addEventListener("scroll", updateBadges, true);
    this.pickerCleanup = () => {
      this.stopPicker(previousStyles, badges, onMouseEnter, onMouseLeave, onClick, onKeyDown, updateBadges);
      onCancel();
    };
    return true;
  }

  private addVideoListener(video: HTMLVideoElement): void {
    if (video.VideoTogetherLiteListenerAdded) {
      return;
    }

    video.VideoTogetherLiteListenerAdded = true;
    const listener = () => this.onVideoActivity();
    for (const eventName of ["canplay", "durationchange", "loadedmetadata", "pause", "play", "playing", "ratechange", "seeked"]) {
      video.addEventListener(eventName, listener, false);
    }
  }

  private ensureVideoId(video: HTMLVideoElement): string {
    if (video.VideoTogetherLiteVideoId === undefined) {
      video.VideoTogetherLiteVideoId = generateUUID();
    }
    return video.VideoTogetherLiteVideoId;
  }

  private forEachVideo(callback: (video: HTMLVideoElement) => void): void {
    document.querySelectorAll("video").forEach((video) => {
      try {
        this.addVideoListener(video);
        this.ensureVideoId(video);
        callback(video);
      } catch {
        // Host pages can expose hostile video wrappers; ignore individual failures.
      }
    });
  }

  private getCandidateVideos(): HTMLVideoElement[] {
    const candidates: HTMLVideoElement[] = [];
    this.forEachVideo((video) => {
      if (isVisibleVideo(video)) {
        candidates.push(video);
      }
    });
    return candidates;
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
    this.ensureVideoId(video);
  }

  private stopPicker(
    previousStyles: Map<HTMLVideoElement, { outline: string; outlineOffset: string }>,
    badges: HTMLButtonElement[],
    onMouseEnter: (event: Event) => void,
    onMouseLeave: (event: Event) => void,
    onClick: (event: MouseEvent) => void,
    onKeyDown: (event: KeyboardEvent) => void,
    updateBadges: () => void
  ): void {
    this.pickerCleanup = null;
    for (const [video, styles] of previousStyles) {
      video.style.outline = styles.outline;
      video.style.outlineOffset = styles.outlineOffset;
      video.removeEventListener("mouseenter", onMouseEnter, true);
      video.removeEventListener("mouseleave", onMouseLeave, true);
    }
    badges.forEach((badge) => badge.remove());
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", updateBadges, true);
    window.removeEventListener("scroll", updateBadges, true);
  }

  private toSummary(video: HTMLVideoElement): FocusableVideo {
    return {
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      id: this.ensureVideoId(video),
      paused: video.paused,
      title: videoTitle(video),
      visible: isVisibleVideo(video)
    };
  }
}
