import { describe, expect, it } from "vitest";
import {
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  parseSteamCmdProgressLine,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";

describe("parseSteamCmdProgressLine", () => {
  it("parses SteamCMD progress percent, bytes and state", () => {
    const parsed = parseSteamCmdProgressLine(
      "Update state (0x61) downloading, progress: 45.67 (123456789 / 270000000)",
    );
    expect(parsed.percent).toBeCloseTo(45.67);
    expect(parsed.label).toMatch(/Downloading/);
    expect(parsed.label).toMatch(/MB/);
    expect(parsed.bytesDownloaded).toBe(123456789);
    expect(parsed.bytesTotal).toBe(270000000);
  });

  it("parses verifying progress", () => {
    const parsed = parseSteamCmdProgressLine(
      "Update state (0x81) verifying update, progress: 12.3 (10 / 100)",
    );
    expect(parsed.percent).toBeCloseTo(12.3);
    expect(parsed.label).toMatch(/Verifying/);
  });

  it("marks SteamCMD success as complete before the separate file-sync phase", () => {
    const parsed = parseSteamCmdProgressLine("Success! App '2430930' fully installed.");
    expect(parsed.percent).toBe(100);
    expect(parsed.label).toMatch(/SteamCMD finished/i);
  });

  it("formats byte progress as MB", () => {
    expect(formatSteamCmdByteProgress(1048576, 20971520)).toBe("1.0 / 20.0 MB");
  });

  it("hides empty or unknown byte totals (avoids 0 / 0 MB during sync)", () => {
    expect(hasMeaningfulSteamCmdByteProgress(0, 0)).toBe(false);
    expect(hasMeaningfulSteamCmdByteProgress(null, null)).toBe(false);
    expect(hasMeaningfulSteamCmdByteProgress(12, 0)).toBe(false);
    expect(hasMeaningfulSteamCmdByteProgress(512, 1024)).toBe(true);
  });

  it("uses Checked noun while verifying", () => {
    expect(steamCmdByteProgressNoun("verify-files")).toBe("Checked");
    expect(steamCmdByteProgressNoun("install-files")).toBe("Downloaded");
    expect(steamCmdByteProgressNoun("sync-files")).toBe("Copied");
  });
});
