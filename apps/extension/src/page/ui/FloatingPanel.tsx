import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { helpLinks, type LocaleMessages } from "../../i18n/messages";
import { getProgressText } from "../app/controllerUtils";
import type { PanelState, ParticipantPanelState } from "../app/VideoTogetherLiteController";
import { useDraggablePanel } from "./useDraggablePanel";

interface FloatingPanelProps {
  iconUrl: string;
  language: "en-us" | "zh-cn";
  messages: LocaleMessages;
  onCancelVideoPicker: () => void;
  onClearFocusedVideo: () => void;
  onCreate: (nickname: string) => void;
  onExit: () => void;
  onFollow: (userId: string) => void;
  onJoin: (inviteCode: string, nickname: string) => void;
  onNicknameChange: (nickname: string) => void;
  onPickVideo: () => void;
  onSetSharing: (sharing: boolean) => void;
  state: PanelState;
}

const statusToneClass = {
  danger: "text-rose-600",
  default: "text-neutral-600",
  success: "text-emerald-600"
};

export function FloatingPanel({
  iconUrl,
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
  onSetSharing,
  state
}: FloatingPanelProps): ReactElement {
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem("VideoTogetherLiteMinimizedHere") === "1"
  );
  const [nickname, setNickname] = useState(state.nickname);
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useDraggablePanel(panelRef, headerRef);

  useEffect(() => {
    setNickname(state.nickname);
  }, [state.nickname]);

  const setStoredMinimized = (value: boolean) => {
    localStorage.setItem("VideoTogetherLiteMinimizedHere", value ? "1" : "0");
    setMinimized(value);
  };

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
    <>
      <div
        id="videoTogetherLiteFlyPanel"
        ref={panelRef}
        className={minimized ? "hidden" : "vtl-panel"}
      >
        <div ref={headerRef} id="videoTogetherLiteHeader" className="vtl-header">
          <div className="flex min-w-0 items-center gap-2">
            <img alt="" className="h-5 w-5 shrink-0" draggable={false} src={iconUrl} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-950">VideoTogether Lite</div>
              <div className="truncate text-[11px] text-neutral-500">
                {state.inRoom ? `${messages.room_code_label} ${state.roomCode}` : messages.ready_status}
              </div>
            </div>
          </div>
          <button
            aria-label="Minimize"
            className="vtl-icon-btn"
            id="videoTogetherLiteMinimize"
            onClick={() => setStoredMinimized(true)}
            type="button"
          >
            <span className="block h-0.5 w-4 rounded bg-current" />
          </button>
        </div>

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
                  onChange={(event) => setInviteCode(event.target.value)}
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
          ) : (
            <div className="grid gap-3">
              <div className="vtl-room-strip">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase text-neutral-500">{messages.room_label}</div>
                  <div className="truncate text-sm font-semibold" id="videoTogetherLiteRoomCodeText">{state.roomCode}</div>
                  <div className="truncate text-[11px] text-neutral-500" id="videoTogetherLiteInviteCodeText">{state.inviteCode}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span id="videoTogetherLiteParticipantCount" className="text-xs text-neutral-500">
                    {state.participantCount}
                  </span>
                  <button className="vtl-btn-compact" disabled={state.inviteCode === ""} onClick={copyInvite} type="button">
                    {copied ? messages.copied_button : messages.copy_invite_button}
                  </button>
                </div>
              </div>

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
                <label className="vtl-toggle">
                  <input
                    checked={state.sharing}
                    id="videoTogetherLiteShareToggle"
                    onChange={(event) => onSetSharing(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{messages.share_progress_toggle}</span>
                </label>
              </section>

              <section className="grid gap-2">
                <div className="vtl-section-title">{messages.shared_videos_title}</div>
                <div className="grid max-h-36 gap-1.5 overflow-auto pr-1">
                  {state.participants.some((participant) => participant.sharing) ? (
                    state.participants
                      .filter((participant) => participant.sharing)
                      .map((participant) => (
                        <ParticipantVideo
                          key={participant.userId}
                          messages={messages}
                          onFollow={onFollow}
                          participant={participant}
                        />
                      ))
                  ) : (
                    <div className="vtl-empty-text">{messages.no_shared_videos}</div>
                  )}
                </div>
              </section>

              <div className="flex gap-2">
                <button className="vtl-btn-danger" id="videoTogetherLiteExitButton" onClick={onExit} type="button">
                  {messages.exit_room_button}
                </button>
                <button className="vtl-btn-secondary" id="videoTogetherLiteHelpButton" onClick={() => window.open(helpLinks[language], "_blank")} type="button">
                  {messages.help_room_button}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        aria-label="Open VideoTogether Lite"
        className={minimized ? "vtl-small-icon" : "hidden"}
        id="videoTogetherLiteSmallIcon"
        onClick={() => setStoredMinimized(false)}
        type="button"
      >
        <img alt="" className="h-6 w-6" draggable={false} id="videoTogetherLiteMaximize" src={iconUrl} />
      </button>
    </>
  );
}

function ParticipantVideo({
  messages,
  onFollow,
  participant
}: {
  messages: LocaleMessages;
  onFollow: (userId: string) => void;
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
          onClick={() => onFollow(participant.userId)}
          type="button"
        >
          {participant.isFollowing ? messages.following_button : messages.follow_button}
        </button>
      ) : null}
    </div>
  );
}
