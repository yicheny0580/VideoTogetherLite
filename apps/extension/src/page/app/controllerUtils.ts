import { generateUUID } from "../infrastructure/videoRegistry";

export function getDisplayTimeText(): string {
  const date = new Date();
  return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

export function generateTempUserId(): string {
  return `${generateUUID()}:${Date.now() / 1000}`;
}

export function isRoomProtected(): boolean {
  return window.VideoTogetherStorage === undefined
    || window.VideoTogetherStorage.PasswordProtectedRoom !== false;
}

export function isWaitForLoadingEnabled(): boolean {
  return window.VideoTogetherStorage?.WaitForLoading
    ?? window.VideoTogetherStorage?.WaitForLoadding
    ?? true;
}
