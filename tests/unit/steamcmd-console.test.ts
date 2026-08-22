import { describe, expect, it } from "vitest";
import {
  STEAMCMD_CONSOLE_MAX_LINES,
  appendSteamCmdConsoleRing,
  clampSteamCmdConsoleLimit,
  formatTimestampedSteamCmdLine,
  shouldLogProgressTickToConsole,
  splitSteamCmdOutputChunk,
  steamCmdProgressPercentChanged,
  stripSteamCmdBareLine,
  stripSteamCmdProgressIngestPrefix,
  trimSteamCmdConsoleRing,
} from "@backend/domains/updates/steamcmd-console";

describe("clampSteamCmdConsoleLimit", () => {
  it("floors to at least 1 and defaults invalid input to 200", () => {
    expect(clampSteamCmdConsoleLimit(50.9)).toBe(50);
    expect(clampSteamCmdConsoleLimit(0)).toBe(1);
    expect(clampSteamCmdConsoleLimit(Number.NaN)).toBe(200);
  });
});

describe("ring buffer helpers", () => {
  it("formats timestamped lines and trims to max", () => {
    expect(formatTimestampedSteamCmdLine("2026-01-01T00:00:00.000Z", "hello"))
      .toBe("[2026-01-01T00:00:00.000Z] hello");
    const lines = Array.from({ length: STEAMCMD_CONSOLE_MAX_LINES + 2 }, (_, i) => `line-${i}`);
    expect(trimSteamCmdConsoleRing(lines, STEAMCMD_CONSOLE_MAX_LINES)).toHaveLength(
      STEAMCMD_CONSOLE_MAX_LINES,
    );
    expect(trimSteamCmdConsoleRing(lines, STEAMCMD_CONSOLE_MAX_LINES)[0]).toBe("line-2");
    expect(appendSteamCmdConsoleRing(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(appendSteamCmdConsoleRing(["a", "b"], "c", 2)).toEqual(["b", "c"]);
  });
});

describe("splitSteamCmdOutputChunk", () => {
  it("splits on CR/LF and keeps trailing partial line", () => {
    expect(splitSteamCmdOutputChunk("", "line1\r\nline2\npartial")).toEqual({
      completeLines: ["line1", "line2"],
      remainder: "partial",
    });
    expect(splitSteamCmdOutputChunk("part", "ial\r\nnext")).toEqual({
      completeLines: ["partial"],
      remainder: "next",
    });
    expect(splitSteamCmdOutputChunk("", "   \r\n")).toEqual({
      completeLines: [],
      remainder: "",
    });
  });
});

describe("stripSteamCmdBareLine", () => {
  it("removes source prefixes and console timestamps", () => {
    expect(stripSteamCmdBareLine("[update/stdout] Downloading")).toBe("Downloading");
    expect(stripSteamCmdBareLine("[console_log] [2026-01-01 12:00:00] OK")).toBe("OK");
    expect(stripSteamCmdProgressIngestPrefix("[verify/stderr] 42%")).toBe("42%");
  });
});

describe("steamCmdProgressPercentChanged", () => {
  it("detects first percent and meaningful deltas", () => {
    expect(steamCmdProgressPercentChanged(null, 10)).toBe(true);
    expect(steamCmdProgressPercentChanged(10, 10.02)).toBe(false);
    expect(steamCmdProgressPercentChanged(10, 10.06)).toBe(true);
    expect(steamCmdProgressPercentChanged(10, null)).toBe(false);
  });
});

describe("shouldLogProgressTickToConsole", () => {
  it("throttles frequent small progress ticks", () => {
    expect(
      shouldLogProgressTickToConsole({
        nowMs: 1000,
        lastLogAtMs: 0,
        parsedPercent: 10,
        lastLoggedPercent: null,
      }),
    ).toBe(true);
    expect(
      shouldLogProgressTickToConsole({
        nowMs: 1000,
        lastLogAtMs: 900,
        parsedPercent: 10.5,
        lastLoggedPercent: 10,
      }),
    ).toBe(false);
    expect(
      shouldLogProgressTickToConsole({
        nowMs: 3000,
        lastLogAtMs: 1000,
        parsedPercent: 10.5,
        lastLoggedPercent: 10,
      }),
    ).toBe(true);
    expect(
      shouldLogProgressTickToConsole({
        nowMs: 1100,
        lastLogAtMs: 1000,
        parsedPercent: 15,
        lastLoggedPercent: 10,
      }),
    ).toBe(true);
  });
});
