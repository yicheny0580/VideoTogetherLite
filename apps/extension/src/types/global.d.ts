import type { VideoTogetherController } from "../page/app/VideoTogetherController";

declare global {
  interface Window {
    VideoTogetherLoading?: boolean;
    VideoTogetherStorage?: {
      PasswordProtectedRoom?: boolean;
      WaitForLoadding?: boolean;
    };
    videoTogetherExtension?: VideoTogetherController | null;
  }

  interface HTMLVideoElement {
    VideoTogetherActivatedTime?: number;
    VideoTogetherLiteListenerAdded?: boolean;
    VideoTogetherVideoId?: string;
  }
}
