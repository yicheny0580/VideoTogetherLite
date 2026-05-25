import { Role } from "@videotogether/shared";

export type StatusTone = "default" | "danger" | "success";

export interface PanelState {
  inRoom: boolean;
  memberCount: number;
  password: string;
  role: Role;
  roomName: string;
  statusText: string;
  statusTone: StatusTone;
}

export function initialPanelState(statusText: string): PanelState {
  return {
    inRoom: false,
    memberCount: 0,
    password: "",
    role: Role.Null,
    roomName: "",
    statusText,
    statusTone: "default"
  };
}
