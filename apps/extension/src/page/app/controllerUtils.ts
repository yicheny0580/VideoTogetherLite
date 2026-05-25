import { generateUUID } from "../infrastructure/videoRegistry";

export function getDisplayTimeText(): string {
  const date = new Date();
  return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

export function generateTempUserId(): string {
  return `${generateUUID()}:${Date.now() / 1000}`;
}

export function isRoomProtected(): boolean {
  return window.VideoTogetherLiteStorage === undefined
    || window.VideoTogetherLiteStorage.PasswordProtectedRoom !== false;
}

export function isWaitForLoadingEnabled(): boolean {
  return window.VideoTogetherLiteStorage?.WaitForLoading
    ?? window.VideoTogetherLiteStorage?.WaitForLoadding
    ?? true;
}
