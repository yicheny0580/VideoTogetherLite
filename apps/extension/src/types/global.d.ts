import type { VideoTogetherLiteController } from "../page/app/VideoTogetherLiteController";

declare global {
  interface Window {
    VideoTogetherLiteLoading?: boolean;
    VideoTogetherLiteStorage?: {
      PasswordProtectedRoom?: boolean;
      WaitForLoading?: boolean;
      WaitForLoadding?: boolean;
    };
    videoTogetherLiteExtension?: VideoTogetherLiteController | null;
  }

  interface HTMLVideoElement {
    VideoTogetherLiteListenerAdded?: boolean;
    VideoTogetherLiteVideoId?: string;
  }
}
