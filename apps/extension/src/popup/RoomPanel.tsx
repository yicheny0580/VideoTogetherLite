import type { Language } from "@videotogetherlite/shared";
import {
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  Clipboard,
  Copy,
  DoorOpen,
  Info,
  LogIn,
  Plus,
  Search,
  TriangleAlert,
  User,
  Users,
  Video,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { helpLinks, type LocaleMessages } from "../i18n/messages";
import type { PanelState, StatusTone } from "../page/app/panelState";
import { getProgressText } from "./format";
import { SharedVideos } from "./SharedVideos";

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
  pageError: string;
  pageErrorTitle: string;
  state: PanelState;
}

const statusToneClass: Record<StatusTone, string> = {
  danger: "vtl-alert-danger",
  default: "vtl-alert-info",
  success: "vtl-alert-success"
};

const statusIcon: Record<StatusTone, LucideIcon> = {
  danger: CircleAlert,
  default: Info,
  success: CircleCheck
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
  pageError,
  pageErrorTitle,
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
  const StatusIcon = statusIcon[state.statusTone];
  const statusText = state.statusText.trim();

  return (
    <div className="vtl-body">
      {statusText ? (
        <div
          className={`vtl-alert ${statusToneClass[state.statusTone]}`}
          id="videoTogetherLiteStatusText"
          role={state.statusTone === "danger" ? "alert" : "status"}
        >
          <StatusIcon aria-hidden="true" className="vtl-alert-icon" />
          <span className="min-w-0 truncate font-medium">{statusText}</span>
        </div>
      ) : null}
      {pageError ? (
        <div className="vtl-alert vtl-alert-danger" role="alert">
          <TriangleAlert aria-hidden="true" className="vtl-alert-icon" />
          <div className="min-w-0">
            <div className="font-semibold">{pageErrorTitle}</div>
            <p className="mt-0.5 break-words text-xs leading-5">{pageError}</p>
          </div>
        </div>
      ) : null}

      <label className="vtl-field">
        <span className="vtl-field-label">
          <User aria-hidden="true" className="h-3.5 w-3.5" />
          {messages.nickname_label}
        </span>
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
    <div className="grid gap-3">
      <button
        className="vtl-btn-primary"
        id="videoTogetherLiteCreateButton"
        onClick={() => onCreate(nickname)}
        type="button"
      >
        <Plus aria-hidden="true" className="vtl-btn-icon" />
        {messages.create_room_button}
      </button>
      <label className="vtl-field">
        <span className="vtl-field-label">
          <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
          {messages.invite_code_label}
        </span>
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
        <LogIn aria-hidden="true" className="vtl-btn-icon" />
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
          <div className="vtl-section-title">{messages.room_label}</div>
          <div className="truncate text-base font-semibold text-neutral-950" id="videoTogetherLiteRoomCodeText">
            {state.roomCode}
          </div>
          <div className="mt-0.5 truncate text-xs text-neutral-500" id="videoTogetherLiteInviteCodeText">
            {state.inviteCode}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="vtl-count-badge" id="videoTogetherLiteParticipantCount">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            {state.participantCount}
          </span>
          <button className="vtl-btn-compact" disabled={state.inviteCode === ""} onClick={onCopyInvite} type="button">
            <Copy aria-hidden="true" className="vtl-btn-icon" />
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

      <div className="grid grid-cols-2 gap-2">
        <button className="vtl-btn-danger" id="videoTogetherLiteExitButton" onClick={onExit} type="button">
          <DoorOpen aria-hidden="true" className="vtl-btn-icon" />
          {messages.exit_room_button}
        </button>
        <button
          className="vtl-btn-secondary"
          id="videoTogetherLiteHelpButton"
          onClick={() => window.open(helpLinks[language], "_blank")}
          type="button"
        >
          <CircleQuestionMark aria-hidden="true" className="vtl-btn-icon" />
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
      <div className="vtl-section-title">
        <Video aria-hidden="true" className="h-3.5 w-3.5" />
        {messages.video_to_share_title}
      </div>
      {state.pickingVideo ? (
        <div className="vtl-focus-empty">
          <span>{messages.pick_video_instruction}</span>
          <button className="vtl-btn-compact" onClick={onCancelVideoPicker} type="button">
            <X aria-hidden="true" className="vtl-btn-icon" />
            {messages.cancel_button}
          </button>
        </div>
      ) : state.focusedVideo === null ? (
        <div className="vtl-focus-empty">
          <span>{messages.no_video_selected}</span>
          <button className="vtl-btn-compact" id="videoTogetherLitePickVideoButton" onClick={onPickVideo} type="button">
            <Search aria-hidden="true" className="vtl-btn-icon" />
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
              <Search aria-hidden="true" className="vtl-btn-icon" />
              {messages.change_button}
            </button>
            <button className="vtl-btn-compact" onClick={onClearFocusedVideo} type="button">
              <X aria-hidden="true" className="vtl-btn-icon" />
              {messages.clear_button}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
