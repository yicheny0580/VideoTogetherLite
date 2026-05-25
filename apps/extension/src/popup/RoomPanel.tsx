import { useEffect, useState, type ReactElement } from "react";

import { helpLinks, type LocaleMessages } from "../i18n/messages";
import type { Language } from "@videotogetherlite/shared";
import type { PanelState, ParticipantPanelState } from "../page/app/panelState";
import { getProgressText } from "./format";

interface RoomPanelProps {
  language: Language;
  messages: LocaleMessages;
  onCancelVideoPicker: () => void;
  onClearFocusedVideo: () => void;
  onCreate: (nickname: string) => void;
  onExit: () => void;
  onFollow: (userId: string) => void;
  onJoin: (inviteCode: string, nickname: string) => void;
  onNicknameChange: (nickname: string) => void;
  onPickVideo: () => void;
  onStopFollow: () => void;
  state: PanelState;
}

const statusToneClass = {
  danger: "text-rose-600",
  default: "text-neutral-600",
  success: "text-emerald-600"
};

export function RoomPanel({
  language,
  messages,
  onCancelVideoPicker,
  onClearFocusedVideo,
  onCreate,
  onExit,
  onFollow,
  onJoin,
  onNicknameChange,
  onPickVideo,
  onStopFollow,
  state
}: RoomPanelProps): ReactElement {
  const [nickname, setNickname] = useState(state.nickname);
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNickname(state.nickname);
  }, [state.nickname]);

  const copyInvite = () => {
    if (state.inviteCode === "") {
      return;
    }
    void navigator.clipboard.writeText(state.inviteCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  const commitNickname = () => onNicknameChange(nickname);

  return (
    <div className="vtl-body">
      <div
        className={`min-h-5 truncate text-xs ${statusToneClass[state.statusTone]}`}
        id="videoTogetherLiteStatusText"
      >
        {state.statusText}
      </div>

      <label className="vtl-field">
        <span>{messages.nickname_label}</span>
        <input
          autoComplete="off"
          className="vtl-input"
          id="videoTogetherLiteNicknameInput"
          onBlur={commitNickname}
          onChange={(event) => setNickname(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitNickname();
            }
          }}
          placeholder={messages.nickname_placeholder}
          value={nickname}
        />
      </label>

      {!state.inRoom ? (
        <JoinControls
          inviteCode={inviteCode}
          messages={messages}
          nickname={nickname}
          onCreate={onCreate}
          onInviteChange={setInviteCode}
          onJoin={onJoin}
        />
      ) : (
        <RoomControls
          copied={copied}
          language={language}
          messages={messages}
          onCancelVideoPicker={onCancelVideoPicker}
          onClearFocusedVideo={onClearFocusedVideo}
          onCopyInvite={copyInvite}
          onExit={onExit}
          onFollow={onFollow}
          onPickVideo={onPickVideo}
          onStopFollow={onStopFollow}
          state={state}
        />
      )}
    </div>
  );
}

function JoinControls({
  inviteCode,
  messages,
  nickname,
  onCreate,
  onInviteChange,
  onJoin
}: {
  inviteCode: string;
  messages: LocaleMessages;
  nickname: string;
  onCreate: (nickname: string) => void;
  onInviteChange: (inviteCode: string) => void;
  onJoin: (inviteCode: string, nickname: string) => void;
}): ReactElement {
  return (
    <div className="grid gap-2">
      <button
        className="vtl-btn-primary"
        id="videoTogetherLiteCreateButton"
        onClick={() => onCreate(nickname)}
        type="button"
      >
        {messages.create_room_button}
      </button>
      <label className="vtl-field">
        <span>{messages.invite_code_label}</span>
        <textarea
          className="vtl-textarea"
          id="videoTogetherLiteInviteCodeInput"
          onChange={(event) => onInviteChange(event.target.value)}
          placeholder={messages.invite_code_placeholder}
          value={inviteCode}
        />
      </label>
      <button
        className="vtl-btn-secondary"
        id="videoTogetherLiteJoinButton"
        onClick={() => onJoin(inviteCode, nickname)}
        type="button"
      >
        {messages.join_room_button}
      </button>
    </div>
  );
}

function RoomControls({
  copied,
  language,
  messages,
  onCancelVideoPicker,
  onClearFocusedVideo,
  onCopyInvite,
  onExit,
  onFollow,
  onPickVideo,
  onStopFollow,
  state
}: {
  copied: boolean;
  language: Language;
  messages: LocaleMessages;
  onCancelVideoPicker: () => void;
  onClearFocusedVideo: () => void;
  onCopyInvite: () => void;
  onExit: () => void;
  onFollow: (userId: string) => void;
  onPickVideo: () => void;
  onStopFollow: () => void;
  state: PanelState;
}): ReactElement {
  return (
    <div className="grid gap-3">
      <div className="vtl-room-strip">
        <div className="min-w-0">
          <div className="text-[11px] uppercase text-neutral-500">{messages.room_label}</div>
          <div className="truncate text-sm font-semibold" id="videoTogetherLiteRoomCodeText">{state.roomCode}</div>
          <div className="truncate text-[11px] text-neutral-500" id="videoTogetherLiteInviteCodeText">
            {state.inviteCode}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span id="videoTogetherLiteParticipantCount" className="text-xs text-neutral-500">
            {state.participantCount}
          </span>
          <button className="vtl-btn-compact" disabled={state.inviteCode === ""} onClick={onCopyInvite} type="button">
            {copied ? messages.copied_button : messages.copy_invite_button}
          </button>
        </div>
      </div>

      <SharedLocalVideo
        messages={messages}
        onCancelVideoPicker={onCancelVideoPicker}
        onClearFocusedVideo={onClearFocusedVideo}
        onPickVideo={onPickVideo}
        state={state}
      />
      <SharedVideos messages={messages} onFollow={onFollow} onStopFollow={onStopFollow} state={state} />

      <div className="flex gap-2">
        <button className="vtl-btn-danger" id="videoTogetherLiteExitButton" onClick={onExit} type="button">
          {messages.exit_room_button}
        </button>
        <button
          className="vtl-btn-secondary"
          id="videoTogetherLiteHelpButton"
          onClick={() => window.open(helpLinks[language], "_blank")}
          type="button"
        >
          {messages.help_room_button}
        </button>
      </div>
    </div>
  );
}

function SharedLocalVideo({
  messages,
  onCancelVideoPicker,
  onClearFocusedVideo,
  onPickVideo,
  state
}: {
  messages: LocaleMessages;
  onCancelVideoPicker: () => void;
  onClearFocusedVideo: () => void;
  onPickVideo: () => void;
  state: PanelState;
}): ReactElement {
  return (
    <section className="grid gap-2">
      <div className="vtl-section-title">{messages.video_to_share_title}</div>
      {state.pickingVideo ? (
        <div className="vtl-focus-empty">
          <span>{messages.pick_video_instruction}</span>
          <button className="vtl-btn-compact" onClick={onCancelVideoPicker} type="button">
            {messages.cancel_button}
          </button>
        </div>
      ) : state.focusedVideo === null ? (
        <div className="vtl-focus-empty">
          <span>{messages.no_video_selected}</span>
          <button className="vtl-btn-compact" id="videoTogetherLitePickVideoButton" onClick={onPickVideo} type="button">
            {messages.pick_video_button}
          </button>
        </div>
      ) : (
        <div className="vtl-focused-row">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{messages.focused_label}</div>
            <div className="truncate text-xs text-neutral-500">{state.focusedVideo.title}</div>
            <div className="text-xs text-neutral-500">
              {getProgressText(state.focusedVideo.currentTime, state.focusedVideo.duration)}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button className="vtl-btn-compact" onClick={onPickVideo} type="button">
              {messages.change_button}
            </button>
            <button className="vtl-btn-compact" onClick={onClearFocusedVideo} type="button">
              {messages.clear_button}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SharedVideos({
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
      <div className="vtl-section-title">{messages.shared_videos_title}</div>
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
          <div className="vtl-empty-text">{messages.no_shared_videos}</div>
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
          {participant.isFollowing ? messages.stop_follow_button : messages.follow_button}
        </button>
      ) : null}
    </div>
  );
}
