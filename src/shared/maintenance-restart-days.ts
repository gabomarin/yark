/** 0 = Sunday … 6 = Saturday (local Windows clock). */
const RESTART_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const RESTART_DAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const ALL_RESTART_DAYS_OF_WEEK: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Unique sorted day indices 0–6; empty input → `[0]` (Sunday). */
export function normalizeRestartDaysOfWeek(days: readonly number[]): number[] {
  const set = new Set<number>();
  for (const day of days) {
    if (!Number.isFinite(day)) continue;
    set.add(Math.min(6, Math.max(0, Math.trunc(day))));
  }
  if (set.size === 0) return [0];
  return [...set].sort((a, b) => a - b);
}

export function formatRestartDaysSummary(days: readonly number[]): string {
  const normalized = normalizeRestartDaysOfWeek(days);
  if (normalized.length === 7) return "Every day";
  if (normalized.length === 1) {
    const dow = normalized[0] ?? 0;
    return RESTART_DAY_LABELS[dow] ?? "Sunday";
  }
  const labels = normalized.map(
    (d) => RESTART_DAY_SHORT[d] ?? RESTART_DAY_LABELS[d] ?? "?",
  );
  if (labels.length === 2) {
    return `${labels[0]} & ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}
