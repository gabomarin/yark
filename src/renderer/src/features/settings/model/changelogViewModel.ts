import type { ChangelogEntry } from "@shared/changelog";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Operator-facing date from curated ISO `YYYY-MM-DD` (local calendar, not UTC). */
export function formatChangelogDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (match === null) {
    return isoDate;
  }
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return isoDate;
  }
  return `${String(Number(match[3]))} ${MONTHS[monthIndex]} ${match[1]}`;
}

export function changelogNoteCount(entry: ChangelogEntry): number {
  return entry.sections.reduce((sum, section) => sum + section.items.length, 0);
}

export function changelogNoteCountLabel(count: number): string {
  return count === 1 ? "1 note" : `${String(count)} notes`;
}
