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
