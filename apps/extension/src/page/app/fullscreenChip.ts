export interface FullscreenChipLabels {
  exitRoom: string;
  focused: string;
  openPanel: string;
  sharingOff: string;
  sharingOn: string;
  sharingOnLabel: string;
}

export interface FullscreenChipActions {
  onExitRoom: () => void;
  onOpenPanel: () => void;
  onToggleSharing: () => void;
}

type FullscreenChipLabelKey =
  | "exit_room_short"
  | "fullscreen_focused"
  | "fullscreen_sharing_on"
  | "open_panel_short"
  | "sharing_off_short"
  | "sharing_on_short";

export function getFullscreenChipLabels(message: (key: FullscreenChipLabelKey) => string): FullscreenChipLabels {
  return {
    exitRoom: message("exit_room_short"),
    focused: message("fullscreen_focused"),
    openPanel: message("open_panel_short"),
    sharingOff: message("sharing_off_short"),
    sharingOn: message("sharing_on_short"),
    sharingOnLabel: message("fullscreen_sharing_on")
  };
}

export function updateFullscreenChip(
  currentChip: HTMLDivElement | null,
  video: HTMLVideoElement | null,
  labels: FullscreenChipLabels,
  sharing: boolean,
  actions: FullscreenChipActions
): HTMLDivElement | null {
  const fullscreenElement = document.fullscreenElement;
  if (
    fullscreenElement === null
    || video === null
    || (fullscreenElement !== video && !fullscreenElement.contains(video))
  ) {
    return removeFullscreenChip(currentChip);
  }
  return renderFullscreenChip(currentChip, fullscreenElement, labels, sharing, actions);
}

export function renderFullscreenChip(
  currentChip: HTMLDivElement | null,
  fullscreenElement: Element,
  labels: FullscreenChipLabels,
  sharing: boolean,
  actions: FullscreenChipActions
): HTMLDivElement {
  const chip = currentChip?.parentElement === fullscreenElement
    ? currentChip
    : createChip(fullscreenElement);

  chip.textContent = "";
  const label = document.createElement("span");
  label.textContent = sharing ? labels.sharingOnLabel : labels.focused;
  chip.appendChild(label);
  chip.appendChild(createChipButton(
    sharing ? labels.sharingOn : labels.sharingOff,
    actions.onToggleSharing
  ));
  chip.appendChild(createChipButton(labels.openPanel, actions.onOpenPanel));
  chip.appendChild(createChipButton(labels.exitRoom, actions.onExitRoom));
  return chip;
}

export function removeFullscreenChip(chip: HTMLDivElement | null): null {
  chip?.remove();
  return null;
}

function createChip(fullscreenElement: Element): HTMLDivElement {
  const chip = document.createElement("div");
  chip.style.cssText = [
    "position: absolute",
    "right: 18px",
    "top: 18px",
    "z-index: 2147483647",
    "display: flex",
    "align-items: center",
    "gap: 8px",
    "border-radius: 999px",
    "background: rgba(17, 24, 39, .88)",
    "color: #fff",
    "font: 600 13px/1.2 Arial, sans-serif",
    "padding: 8px 10px",
    "box-shadow: 0 10px 30px rgba(0,0,0,.32)"
  ].join(";");
  fullscreenElement.appendChild(chip);
  return chip;
}

function createChipButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = [
    "border: 0",
    "border-radius: 999px",
    "background: rgba(255,255,255,.16)",
    "color: #fff",
    "cursor: pointer",
    "font: inherit",
    "padding: 5px 8px"
  ].join(";");
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };
  return button;
}
