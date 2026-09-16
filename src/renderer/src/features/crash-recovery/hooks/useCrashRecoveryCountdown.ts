import { useEffect, useState } from "react";

/** Seconds until an ISO restart target; 0 when it is due (or unparseable). */
function crashRecoverySecondsUntil(iso: string, now = Date.now()): number {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.round((target - now) / 1000));
}

/** Human countdown: `45s`, `2m`, `1m 05s`. */
export function formatCrashRecoveryCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/** Ticks once per second while a crash-recovery retry is scheduled (#563). */
export function useCrashRecoveryCountdown(restartAt: string): number {
  const [remaining, setRemaining] = useState(() => crashRecoverySecondsUntil(restartAt));

  useEffect(() => {
    setRemaining(crashRecoverySecondsUntil(restartAt));
    const id = window.setInterval(() => {
      setRemaining(crashRecoverySecondsUntil(restartAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restartAt]);

  return remaining;
}
