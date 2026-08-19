import { describe, expect, it } from "vitest";
import {
  canPauseSteamCmdJob,
  canPauseSteamCmdOperation,
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  parseSteamCmdProgressLine,
  steamCmdByteProgressNoun,
  steamCmdProgressFallbackLabel,
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

  it("parses English SteamCMD bootstrapper bracket progress", () => {
    const parsed = parseSteamCmdProgressLine(
      "[ 59%] Downloading update (11,343 of 19,014 KB)...",
    );
    expect(parsed.percent).toBe(59);
    expect(parsed.label).toMatch(/Updating SteamCMD/i);
    expect(parsed.label).toMatch(/MB/);
    expect(parsed.bytesDownloaded).toBe(Math.round(11343 * 1024));
    expect(parsed.bytesTotal).toBe(Math.round(19014 * 1024));
  });

  it("updates percent from localized bootstrapper lines without translating labels", () => {
    const parsed = parseSteamCmdProgressLine(
      "[ 59%] Descargando archivos (11,343 de 19,014 KB)...",
    );
    expect(parsed.percent).toBe(59);
    // No Spanish dictionary — leave label null so the dock keeps its English status text.
    expect(parsed.label).toBeNull();
    expect(parsed.bytesDownloaded).toBeNull();
    expect(parsed.bytesTotal).toBeNull();
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

  it("allows Pause only for install, update, and file copy", () => {
    expect(canPauseSteamCmdOperation("install-files")).toBe(true);
    expect(canPauseSteamCmdOperation("update")).toBe(true);
    expect(canPauseSteamCmdOperation("sync-files")).toBe(true);
    expect(canPauseSteamCmdOperation("verify-files")).toBe(false);
    expect(canPauseSteamCmdOperation("install-steamcmd")).toBe(false);
    expect(canPauseSteamCmdOperation(null)).toBe(false);
  });

  it("refuses Pause during an in-progress rollback", () => {
    expect(canPauseSteamCmdJob("update", "applying-files")).toBe(true);
    expect(canPauseSteamCmdJob("update", "rollback-restoring-backups")).toBe(false);
    expect(canPauseSteamCmdJob("update", "rollback-complete")).toBe(true);
    expect(canPauseSteamCmdJob("verify-files", "validating")).toBe(false);
  });

  it("falls back to an operation-specific progress title", () => {
    expect(steamCmdProgressFallbackLabel("install-files")).toBe("Installing files…");
    expect(steamCmdProgressFallbackLabel("verify-files")).toBe("Verifying");
    expect(steamCmdProgressFallbackLabel("update")).toBe("Updating files…");
    expect(steamCmdProgressFallbackLabel(null)).toBe("Updating files…");
  });
});
