import { Users, Video, VideoOff, X } from "lucide-react";
import type { ReactElement } from "react";

import type { LocaleMessages } from "../i18n/messages";
import type { PanelState, ParticipantPanelState } from "../page/app/panelState";
import { getProgressText } from "./format";

export function SharedVideos({
  messages,
  onFollow,
  onStopFollow,
  state
}: {
  messages: LocaleMessages;
  onFollow: (userId: string) => void;
  onStopFollow: () => void;
  state: PanelState;
}): ReactElement {
  const sharingParticipants = state.participants.filter((participant) => participant.sharing);
  return (
    <section className="grid gap-2">
      <div className="vtl-section-title">
        <Users aria-hidden="true" className="h-3.5 w-3.5" />
        {messages.shared_videos_title}
      </div>
      <div className="grid max-h-36 gap-1.5 overflow-auto pr-1">
        {sharingParticipants.length > 0 ? (
          sharingParticipants.map((participant) => (
            <ParticipantVideo
              key={participant.userId}
              messages={messages}
              onFollow={onFollow}
              onStopFollow={onStopFollow}
              participant={participant}
            />
          ))
        ) : (
          <div className="vtl-empty-text">
            <VideoOff aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{messages.no_shared_videos}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ParticipantVideo({
  messages,
  onFollow,
  onStopFollow,
  participant
}: {
  messages: LocaleMessages;
  onFollow: (userId: string) => void;
  onStopFollow: () => void;
  participant: ParticipantPanelState;
}): ReactElement {
  return (
    <div className="vtl-participant-video">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {participant.nickname}{participant.isLocal ? ` ${messages.you_label}` : ""}
        </div>
        <div className="truncate text-xs text-neutral-500">{participant.title}</div>
        <div className="truncate text-xs text-neutral-500">
          {participant.urlHost} | {participant.paused ? messages.paused_label : messages.playing_label} | {getProgressText(participant.currentTime, participant.duration)}
        </div>
      </div>
      {!participant.isLocal ? (
        <button
          className={participant.isFollowing ? "vtl-btn-compact-active" : "vtl-btn-compact"}
          onClick={() => participant.isFollowing ? onStopFollow() : onFollow(participant.userId)}
          type="button"
        >
          {participant.isFollowing ? (
            <X aria-hidden="true" className="vtl-btn-icon" />
          ) : (
            <Video aria-hidden="true" className="vtl-btn-icon" />
          )}
          {participant.isFollowing ? messages.stop_follow_button : messages.follow_button}
        </button>
      ) : null}
    </div>
  );
}
