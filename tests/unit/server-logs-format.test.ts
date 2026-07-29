import { describe, expect, it } from "vitest";
import { formatLogDateTime } from "@shared/format-log-datetime";
import {
  filterRuntimeLogLines,
  formatRuntimeLogLineForDisplay,
  formatUnrealLogBody,
  parseRuntimeLogSource,
} from "../../src/renderer/src/features/logs/serverLogsFormat";

const sample = [
  "[2026-07-29T20:11:41.709Z] [system] Starting process",
  "[2026-07-29T20:11:43.237Z] [log] ARK Version: 92.28",
  "[2026-07-29T20:11:43.581Z] [stderr] GameAnalytics noise",
  "[2026-07-29T20:11:43.600Z] [stdout] rare stdout",
  "[2026-07-29T20:11:50.000Z] [error] Process error: boom",
];

describe("parseRuntimeLogSource", () => {
  it("reads the bracketed source tag", () => {
    expect(parseRuntimeLogSource(sample[1]!)).toBe("log");
    expect(parseRuntimeLogSource("untagged")).toBeNull();
  });
});

describe("filterRuntimeLogLines", () => {
  it("keeps all lines for all", () => {
    expect(filterRuntimeLogLines(sample, "all")).toEqual(sample);
  });

  it("filters system including error", () => {
    expect(filterRuntimeLogLines(sample, "system")).toEqual([
      sample[0],
      sample[4],
    ]);
  });

  it("filters ASA disk log source as Server log", () => {
    expect(filterRuntimeLogLines(sample, "asa")).toEqual([sample[1]]);
  });

  it("filters process pipes", () => {
    expect(filterRuntimeLogLines(sample, "process")).toEqual([
      sample[2],
      sample[3],
    ]);
  });
});

describe("formatUnrealLogBody", () => {
  it("treats Unreal stamps as UTC and formats local wall-clock", () => {
    const utc = new Date(Date.UTC(2026, 6, 29, 21, 42, 52, 443));
    const expected = formatLogDateTime(utc, { includeMs: true });
    expect(
      formatUnrealLogBody(
        "[2026.07.29-21.42.52:443][  5]Server has successfully started!",
      ),
    ).toBe(`${expected} [5] Server has successfully started!`);
  });

  it("handles stamp-only lines", () => {
    const utc = new Date(Date.UTC(2026, 6, 29, 21, 42, 52, 443));
    const expected = formatLogDateTime(utc, { includeMs: true });
    expect(formatUnrealLogBody("[2026.07.29-21.42.52:443][  5]")).toBe(
      `${expected} [5]`,
    );
  });
});

describe("formatRuntimeLogLineForDisplay", () => {
  it("shows only local Unreal time for server log lines", () => {
    const utc = new Date(Date.UTC(2026, 6, 29, 21, 42, 52, 443));
    const expected = formatLogDateTime(utc, { includeMs: true });
    expect(
      formatRuntimeLogLineForDisplay(
        "[2026-07-29T21:42:52.820Z] [log] [2026.07.29-21.42.52:443][  5]ARK Version: 92.28",
      ),
    ).toBe(`${expected} [5] ARK Version: 92.28`);
  });

  it("drops capture ISO for system lines", () => {
    expect(
      formatRuntimeLogLineForDisplay(
        "[2026-07-29T21:42:52.820Z] [system] Starting process",
      ),
    ).toBe("[system] Starting process");
  });
});
