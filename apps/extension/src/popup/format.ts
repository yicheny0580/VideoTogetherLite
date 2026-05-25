export function getProgressText(currentTime: number, duration: number): string {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return "0:00";
  }
  const current = formatSeconds(currentTime);
  if (!Number.isFinite(duration) || duration <= 0) {
    return current;
  }
  return `${current} / ${formatSeconds(duration)}`;
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
