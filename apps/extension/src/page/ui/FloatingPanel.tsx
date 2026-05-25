import { Role } from "@videotogether/shared";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { helpLinks, type LocaleMessages } from "../../i18n/messages";
import type { PanelState } from "../app/VideoTogetherController";
import { useDraggablePanel } from "./useDraggablePanel";

interface FloatingPanelProps {
  iconUrl: string;
  language: "en-us" | "zh-cn";
  messages: LocaleMessages;
  onCreate: (name: string, password: string) => void;
  onExit: () => void;
  onJoin: (name: string, password: string) => void;
  state: PanelState;
}

const statusToneClass = {
  danger: "text-red-600",
  default: "text-neutral-900",
  success: "text-emerald-600"
};

export function FloatingPanel({
  iconUrl,
  language,
  messages,
  onCreate,
  onExit,
  onJoin,
  state
}: FloatingPanelProps): ReactElement {
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem("VideoTogetherMinimizedHere") === "1"
  );
  const [roomName, setRoomName] = useState(state.roomName);
  const [password, setPassword] = useState(state.password);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useDraggablePanel(panelRef, headerRef);

  useEffect(() => {
    setRoomName(state.roomName);
    setPassword(state.password);
  }, [state.password, state.roomName]);

  const setStoredMinimized = (value: boolean) => {
    localStorage.setItem("VideoTogetherMinimizedHere", value ? "1" : "0");
    setMinimized(value);
  };

  const roleText = state.role === Role.Master
    ? messages.host_role
    : state.role === Role.Member
      ? messages.memeber_role
      : "";

  return (
    <>
      <div
        id="videoTogetherFlyPannel"
        ref={panelRef}
        className={minimized ? "hidden" : "vt-panel"}
      >
        <div ref={headerRef} id="videoTogetherHeader" className="vt-header">
          <div className="flex min-w-0 items-center gap-2">
            <img alt="" className="h-4 w-4 shrink-0" draggable={false} src={iconUrl} />
            <div className="truncate text-base font-medium">VideoTogether Lite</div>
          </div>
          <button
            aria-label="Minimize"
            className="vt-icon-btn"
            id="videoTogetherMinimize"
            onClick={() => setStoredMinimized(true)}
            type="button"
          >
            <span className="block h-0.5 w-4 rounded bg-current" />
          </button>
        </div>

        <div className="flex h-[105px] flex-col gap-2 px-3 py-2 text-sm text-neutral-950">
          <div className="flex h-[18px] justify-center gap-2 overflow-hidden whitespace-nowrap">
            <span id="videoTogetherRoleText">{roleText}</span>
            <span id="memberCount">
              {state.memberCount > 0 ? `${String.fromCodePoint(0x1f465)} ${state.memberCount}` : ""}
            </span>
          </div>
          <div
            className={`h-[18px] overflow-hidden text-ellipsis whitespace-nowrap ${statusToneClass[state.statusTone]}`}
            id="videoTogetherStatusText"
          >
            {state.statusText}
          </div>

          <label className="grid grid-cols-[76px_1fr] items-center gap-1.5 text-left">
            <span className="truncate" id="videoTogetherRoomNameLabel">
              {messages.room_input_lable}
            </span>
            <input
              autoComplete="off"
              className="vt-input"
              disabled={state.inRoom}
              id="videoTogetherRoomNameInput"
              onChange={(event) => setRoomName(event.target.value)}
              placeholder={messages.room_input_placeholder}
              value={roomName}
            />
          </label>

          {!state.inRoom ? (
            <label
              className="grid grid-cols-[76px_1fr] items-center gap-1.5 text-left"
              id="videoTogetherRoomPasswordLabel"
            >
              <span className="truncate">{messages.password_input_lable}</span>
              <input
                autoComplete="off"
                className="vt-input"
                id="videoTogetherRoomPdIpt"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={messages.password_input_placeholder}
                value={password}
              />
            </label>
          ) : null}
        </div>

        <div className="vt-footer">
          {!state.inRoom ? (
            <div className="flex gap-1.5" id="lobbyBtnGroup">
              <button className="vt-btn bg-sky-500 text-white" id="videoTogetherCreateButton" onClick={() => onCreate(roomName, password)} type="button">
                {messages.create_room_button}
              </button>
              <button className="vt-btn bg-emerald-500 text-white" id="videoTogetherJoinButton" onClick={() => onJoin(roomName, password)} type="button">
                {messages.join_room_button}
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5" id="roomButtonGroup">
              <button className="vt-btn bg-red-500 text-white" id="videoTogetherExitButton" onClick={onExit} type="button">
                {messages.exit_room_button}
              </button>
            </div>
          )}
          <button className="vt-btn bg-white text-neutral-900" id="videoTogetherHelpButton" onClick={() => window.open(helpLinks[language], "_blank")} type="button">
            {messages.help_room_button}
          </button>
        </div>
      </div>

      <button
        aria-label="Open VideoTogether"
        className={minimized ? "vt-small-icon" : "hidden"}
        id="videoTogetherSamllIcon"
        onClick={() => setStoredMinimized(false)}
        type="button"
      >
        <img alt="" className="h-6 w-6" draggable={false} id="videoTogetherMaximize" src={iconUrl} />
      </button>
    </>
  );
}
