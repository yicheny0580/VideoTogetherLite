export const stateKeys = [
  "VideoTogetherLiteUrl",
  "VideoTogetherLiteRoomCode",
  "VideoTogetherLiteSessionToken",
  "VideoTogetherLiteFollowUserId",
  "VideoTogetherLiteSharing",
  "VideoTogetherLiteTimestamp"
] as const;

export interface RoomState {
  followUserId: string;
  roomCode: string;
  sessionToken: string;
  sharing?: boolean;
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

export function linkWithRoomState(
  link: string,
  roomCode: string,
  sessionToken: string,
  followUserId = ""
): URL {
  const url = new URL(link);
  const oldSearch = url.search;
  url.search = "";
  url.searchParams.set("VideoTogetherLiteUrl", link);
  url.searchParams.set("VideoTogetherLiteRoomCode", roomCode);
  url.searchParams.set("VideoTogetherLiteSessionToken", sessionToken);
  url.searchParams.set("VideoTogetherLiteTimestamp", String(Date.now() / 1000));
  if (followUserId !== "") {
    url.searchParams.set("VideoTogetherLiteFollowUserId", followUserId);
  }

  const stateUrl = oldSearch.length > 1
    ? `${url.toString()}&${oldSearch.slice(1)}`
    : url.toString();

  return new URL(stateUrl);
}
