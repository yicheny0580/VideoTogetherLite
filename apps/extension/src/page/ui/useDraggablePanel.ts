import { useEffect, type RefObject } from "react";

type Position = {
  left: number;
  top: number;
  x: number;
  y: number;
};

function getPoint(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  return "touches" in event ? event.touches[0]! : event;
}

export function useDraggablePanel(
  panelRef: RefObject<HTMLDivElement | null>,
  handleRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const panel = panelRef.current;
    const handle = handleRef.current;
    if (!panel || !handle) {
      return undefined;
    }

    let position: Position | null = null;
    const startDrag = (event: MouseEvent | TouchEvent) => {
      event.preventDefault();
      const point = getPoint(event);
      const styles = window.getComputedStyle(panel);
      let left = Number(styles.getPropertyValue("left").replace("px", ""));
      let top = Number(styles.getPropertyValue("top").replace("px", ""));
      if (Number.isNaN(left)) {
        left = document.documentElement.clientWidth - panel.clientWidth - 15;
      }
      if (Number.isNaN(top)) {
        top = document.documentElement.clientHeight - panel.clientHeight - 15;
      }
      position = {
        left,
        top,
        x: point.clientX,
        y: point.clientY
      };
    };

    const drag = (event: MouseEvent | TouchEvent) => {
      if (position === null) {
        return;
      }
      const point = getPoint(event);
      const left = position.left + point.clientX - position.x;
      const top = position.top + point.clientY - position.y;
      panel.style.left = `${Math.min(
        document.documentElement.clientWidth - panel.clientWidth,
        Math.max(0, left)
      )}px`;
      panel.style.top = `${Math.min(
        document.documentElement.clientHeight - panel.clientHeight,
        Math.max(0, top)
      )}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    };

    const endDrag = () => {
      position = null;
    };

    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("touchstart", startDrag);
    document.addEventListener("mousemove", drag);
    document.addEventListener("touchmove", drag);
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);

    return () => {
      handle.removeEventListener("mousedown", startDrag);
      handle.removeEventListener("touchstart", startDrag);
      document.removeEventListener("mousemove", drag);
      document.removeEventListener("touchmove", drag);
      document.removeEventListener("mouseup", endDrag);
      document.removeEventListener("touchend", endDrag);
    };
  }, [handleRef, panelRef]);
}
