import type { MaintenanceJobWarnings, MaintenancePolicy } from "./types";

const OFFSET_RE = /^(\d+)(s|m)$/i;

/** Parse `30m` / `10s` labels used by maintenance warning presets. */
export function parseMaintenanceOffsetToMs(label: string): number | null {
  const match = OFFSET_RE.exec(label.trim());
  if (match === null) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2]!.toLowerCase();
  return unit === "s" ? amount * 1_000 : amount * 60_000;
}

/** Offsets for a job, preferring custom list when preset is custom. */
export function resolveWarningOffsetLabels(
  warnings: MaintenanceJobWarnings,
  presetTable: Record<"quiet" | "standard" | "strict", readonly string[]>,
): string[] {
  if (warnings.preset === "custom") {
    return warnings.customOffsets.filter((o) => parseMaintenanceOffsetToMs(o) !== null);
  }
  return [...presetTable[warnings.preset]];
}

export function maxWarningLeadMs(offsetLabels: readonly string[]): number {
  let max = 60_000;
  for (const label of offsetLabels) {
    const ms = parseMaintenanceOffsetToMs(label);
    if (ms !== null && ms > max) max = ms;
  }
  return max;
}

/**
 * Next local-clock restart instant strictly after `fromMs`.
 * `restartDayOfWeek`: 0 = Sunday … 6 = Saturday (weekly only).
 */
export function nextLocalRestartAt(
  cadence: MaintenancePolicy["restartCadence"],
  dayOfWeek: number,
  timeLocal: string,
  fromMs: number,
): Date | null {
  const parts = /^(\d{2}):(\d{2})$/.exec(timeLocal);
  if (parts === null) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  if (hour > 23 || minute > 59) return null;

  const from = new Date(fromMs);
  if (cadence === "daily") {
    const candidate = new Date(from);
    candidate.setSeconds(0, 0);
    candidate.setMilliseconds(0);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= fromMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  const dow = Math.min(6, Math.max(0, Math.trunc(dayOfWeek)));
  for (let add = 0; add <= 7; add++) {
    const candidate = new Date(from);
    candidate.setSeconds(0, 0);
    candidate.setMilliseconds(0);
    candidate.setDate(from.getDate() + add);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getDay() === dow && candidate.getTime() > fromMs) {
      return candidate;
    }
  }
  return null;
}

/** Human phrase for `{time}` in long-window Broadcast templates. */
export function formatWarningTimePhrase(remainingMs: number): string {
  const sec = Math.max(0, Math.ceil(remainingMs / 1_000));
  if (sec < 60) {
    return sec === 1 ? "1 second" : `${sec} seconds`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return min === 1 ? "1 minute" : `${min} minutes`;
  }
  const hours = Math.round(min / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function renderWarningTemplate(template: string, remainingMs: number): string {
  return template.replaceAll("{time}", formatWarningTimePhrase(remainingMs));
}

/** Fixed last-minute templates (1 Hz) — not operator-editable. */
const LAST_MINUTE_RESTART_TEMPLATE = "Restart in {n}s";

export function renderLastMinuteRestart(remainingSec: number): string {
  const n = Math.max(0, Math.ceil(remainingSec));
  return LAST_MINUTE_RESTART_TEMPLATE.replaceAll("{n}", String(n));
}

/** Lead time for Run now (short confirm → final warning window). */
export const MAINTENANCE_RUN_NOW_LEAD_MS = 10_000;

export const MAINTENANCE_RESTART_FAIL_LIMIT = 3;

/**
 * Consecutive Broadcast failures within one countdown window before hard-fail.
 * Warning ticks are sparse (~15s); last-minute is 1 Hz — either way, a few
 * blips recover, a stuck RCON aborts instead of retrying forever.
 */
export const MAINTENANCE_RCON_SOFT_FAIL_LIMIT = 3;
