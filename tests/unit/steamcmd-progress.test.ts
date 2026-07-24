import { describe, expect, it } from "vitest";
import {
  formatSteamCmdByteProgress,
  parseSteamCmdProgressLine,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";

describe("parseSteamCmdProgressLine", () => {
  it("parses SteamCMD progress percent, bytes and state", () => {
    const parsed = parseSteamCmdProgressLine(
      "Update state (0x61) downloading, progress: 45.67 (123456789 / 270000000)",
    );
    expect(parsed.percent).toBeCloseTo(45.67);
    expect(parsed.label).toMatch(/Descargando/);
    expect(parsed.label).toMatch(/MB/);
    expect(parsed.bytesDownloaded).toBe(123456789);
    expect(parsed.bytesTotal).toBe(270000000);
  });

  it("parses verifying progress", () => {
    const parsed = parseSteamCmdProgressLine(
      "Update state (0x81) verifying update, progress: 12.3 (10 / 100)",
    );
    expect(parsed.percent).toBeCloseTo(12.3);
    expect(parsed.label).toMatch(/Verificando/);
  });

  it("marks success as 100%", () => {
    const parsed = parseSteamCmdProgressLine("Success! App '2430930' fully installed.");
    expect(parsed.percent).toBe(100);
  });

  it("formats byte progress as MB", () => {
    expect(formatSteamCmdByteProgress(1048576, 20971520)).toBe("1.0 / 20.0 MB");
  });

  it("uses Comprobado noun while verifying", () => {
    expect(steamCmdByteProgressNoun("verify-files")).toBe("Comprobado");
    expect(steamCmdByteProgressNoun("install-files")).toBe("Descargado");
    expect(steamCmdByteProgressNoun("sync-files")).toBe("Copiado");
  });
});
