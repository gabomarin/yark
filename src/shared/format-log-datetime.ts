/**
 * Shared log timestamp formatting for UI (Events, Runtime, Updates, Backups).
 * Always local wall-clock: `YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DD HH:MM:SS.mmm`.
 */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function formatLogDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms?: number,
): string {
  const base = `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
  if (ms === undefined) return base;
  return `${base}.${pad(ms, 3)}`;
}

/** English only until app i18n (#358). Do not use the OS locale. */
const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Relative primary label for events younger than this; absolute beyond. */
export const WHEN_RECENT_MS = 24 * 60 * 60 * 1000;

export type WhenLabel = {
  primary: string;
  tooltip: string;
};

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffSec = Math.round((date.getTime() - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relativeTimeFormat.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return relativeTimeFormat.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTimeFormat.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return relativeTimeFormat.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return relativeTimeFormat.format(diffMonth, "month");
  return relativeTimeFormat.format(Math.round(diffMonth / 12), "year");
}

/**
 * Relative within 24h, local timestamp older. Tooltip shows the other form.
 */
export function formatWhenLabel(
  iso: string,
  nowMs = Date.now(),
  options?: { recentThresholdMs?: number },
): WhenLabel {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { primary: iso, tooltip: iso };
  }
  const threshold = options?.recentThresholdMs ?? WHEN_RECENT_MS;
  const relative = formatRelativeTime(iso, nowMs);
  const absolute = formatLogDateTime(iso, { fallback: iso });
  const ageMs = Math.abs(date.getTime() - nowMs);
  if (ageMs < threshold) {
    return { primary: relative, tooltip: absolute };
  }
  return { primary: absolute, tooltip: relative };
}

/**
 * Format an ISO/Date/epoch value for log panels.
 * Invalid input returns `fallback` (default `"—"`), or the original string when
 * `fallback` is omitted and input was a non-empty string that failed to parse.
 */
export function formatLogDateTime(
  input: string | Date | number | null | undefined,
  options?: { includeMs?: boolean; fallback?: string },
): string {
  const fallback = options?.fallback;
  if (input == null || input === "") {
    return fallback ?? "—";
  }

  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    if (fallback !== undefined) return fallback;
    return typeof input === "string" ? input : "—";
  }

  return formatLogDateTimeParts(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    options?.includeMs === true ? date.getMilliseconds() : undefined,
  );
}
