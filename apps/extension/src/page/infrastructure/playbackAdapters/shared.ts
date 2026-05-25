export function finiteNumber(value: unknown): number | null {
  const numberValue = Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function readFiniteNumber(read: () => unknown): number | null {
  try {
    return finiteNumber(read());
  } catch {
    return null;
  }
}

export function clampSeekTime(duration: number, targetTime: number): number {
  if (duration > 0) {
    return Math.min(Math.max(targetTime, 0), duration);
  }
  return Math.max(targetTime, 0);
}
