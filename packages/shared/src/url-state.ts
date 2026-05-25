import { Role } from "./roles";

export const stateKeys = [
  "VideoTogetherLiteUrl",
  "VideoTogetherLiteRoomName",
  "VideoTogetherLiteRole",
  "VideoTogetherLiteSessionToken",
  "VideoTogetherLitePassword",
  "VideoTogetherLiteTimestamp"
] as const;

export interface RoomState {
  role: Role;
  roomName: string;
  sessionToken: string;
  timestamp: number;
  url: string;
}

export function linkWithoutState(link: string | URL | Location): string {
  const url = new URL(link.toString());
  for (const key of stateKeys) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

export function linkWithMemberState(link: string, roomName: string, sessionToken: string, role: Role): URL {
  const url = new URL(link);
  const oldSearch = url.search;
  url.search = "";
  url.searchParams.set("VideoTogetherLiteUrl", link);
  url.searchParams.set("VideoTogetherLiteRoomName", roomName);
  url.searchParams.set("VideoTogetherLiteSessionToken", sessionToken);
  url.searchParams.set("VideoTogetherLiteRole", String(role));
  url.searchParams.set("VideoTogetherLiteTimestamp", String(Date.now() / 1000));

  const stateUrl = oldSearch.length > 1
    ? `${url.toString()}&${oldSearch.slice(1)}`
    : url.toString();

  return new URL(stateUrl);
}

export function parseRole(value: string | null): Role | null {
  const role = Number.parseInt(value ?? "", 10);
  return role === Role.Master || role === Role.Member ? role : null;
}
