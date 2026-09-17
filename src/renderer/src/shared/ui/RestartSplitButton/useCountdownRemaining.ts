import { useEffect, useState } from "react";

/** `mm:ss` label for a live countdown. */
export function formatRestartCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Remaining ms until `targetAtMs`, ticking ~4x/s. Null when no target. */
export function useCountdownRemaining(targetAtMs: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    targetAtMs === null ? null : Math.max(0, targetAtMs - Date.now()),
  );

  useEffect(() => {
    if (targetAtMs === null) {
      setRemaining(null);
      return;
    }
    const tick = (): void => {
      setRemaining(Math.max(0, targetAtMs - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [targetAtMs]);

  return remaining;
}
