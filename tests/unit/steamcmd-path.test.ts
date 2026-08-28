import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STEAMCMD_MISSING_MESSAGE,
  buildSteamCmdCandidatePaths,
  buildSteamCmdInstallPowerShell,
  isSteamCmdVerifyExitAcceptable,
  normalizeSteamCmdExecutablePath,
  resolveSteamCmdExecutableCached,
  updateJobNeedsSteamCmdExecutable,
} from "@backend/domains/updates/steamcmd-path";

describe("buildSteamCmdCandidatePaths", () => {
  it("prefers configured, env, then managed dir", () => {
    expect(
      buildSteamCmdCandidatePaths({
        configured: "C:\\tools\\steamcmd.exe",
        envPath: "D:\\env\\steamcmd.exe",
        steamcmdDir: "E:\\managed",
        isolated: true,
      }),
    ).toEqual([
      "C:\\tools\\steamcmd.exe",
      "D:\\env\\steamcmd.exe",
      join("E:\\managed", "steamcmd.exe"),
    ]);
  });

  it("skips host defaults when isolated", () => {
    const paths = buildSteamCmdCandidatePaths({
      steamcmdDir: "E:\\managed",
      isolated: true,
      programFiles: "C:\\Program Files",
      localAppData: "C:\\Users\\x\\AppData\\Local",
    });
    expect(paths.some((path) => path.includes("C:\\steamcmd"))).toBe(false);
    expect(paths).toEqual([join("E:\\managed", "steamcmd.exe")]);
  });

  it("includes host defaults when not isolated", () => {
    const paths = buildSteamCmdCandidatePaths({
      steamcmdDir: "E:\\managed",
      isolated: false,
      programFilesX86: "C:\\Program Files (x86)",
      programFiles: "C:\\Program Files",
      localAppData: "C:\\Users\\x\\AppData\\Local",
    });
    expect(paths).toContain("C:\\steamcmd\\steamcmd.exe");
    expect(paths).toContain(join("C:\\Program Files", "SteamCMD", "steamcmd.exe"));
    expect(paths).toContain(
      join("C:\\Users\\x\\AppData\\Local", "Programs", "steamcmd", "steamcmd.exe"),
    );
  });
});

describe("resolveSteamCmdExecutableCached", () => {
  it("returns null when confirmed missing (#145)", () => {
    expect(
      resolveSteamCmdExecutableCached({
        confirmedMissing: true,
        lastKnownPath: "C:\\steamcmd\\steamcmd.exe",
        configured: "C:\\cfg\\steamcmd.exe",
        envPath: "C:\\env\\steamcmd.exe",
      }),
    ).toBeNull();
  });

  it("prefers lastKnown, then configured, then env", () => {
    expect(
      resolveSteamCmdExecutableCached({
        confirmedMissing: false,
        lastKnownPath: "C:\\last\\steamcmd.exe",
        configured: "C:\\cfg\\steamcmd.exe",
        envPath: "C:\\env\\steamcmd.exe",
      }),
    ).toBe("C:\\last\\steamcmd.exe");
    expect(
      resolveSteamCmdExecutableCached({
        confirmedMissing: false,
        lastKnownPath: null,
        configured: "  C:\\cfg\\steamcmd.exe  ",
        envPath: "C:\\env\\steamcmd.exe",
      }),
    ).toBe("C:\\cfg\\steamcmd.exe");
    expect(
      resolveSteamCmdExecutableCached({
        confirmedMissing: false,
        lastKnownPath: null,
        configured: null,
        envPath: " C:\\env\\steamcmd.exe ",
      }),
    ).toBe("C:\\env\\steamcmd.exe");
  });
});

describe("normalizeSteamCmdExecutablePath", () => {
  it("trims and rejects empty paths", () => {
    expect(normalizeSteamCmdExecutablePath("  C:\\steamcmd.exe  ")).toBe(
      "C:\\steamcmd.exe",
    );
    expect(() => normalizeSteamCmdExecutablePath("   ")).toThrow(/SteamCMD path is empty/);
  });
});

describe("buildSteamCmdInstallPowerShell", () => {
  it("embeds escaped dir and zip install steps", () => {
    const script = buildSteamCmdInstallPowerShell("C:\\Steam's\\cmd");
    expect(script).toContain("C:\\Steam''s\\cmd");
    expect(script).toContain("steamcmd.zip");
    expect(script).toContain("Expand-Archive");
    expect(script).toContain("steamcmd.exe.bak");
    expect(STEAMCMD_MISSING_MESSAGE).toMatch(/SteamCMD is not installed/);
  });
});

describe("isSteamCmdVerifyExitAcceptable", () => {
  it("accepts zero exit or any stdout/stderr", () => {
    expect(isSteamCmdVerifyExitAcceptable(0, false)).toBe(true);
    expect(isSteamCmdVerifyExitAcceptable(1, true)).toBe(true);
    expect(isSteamCmdVerifyExitAcceptable(1, false)).toBe(false);
    expect(isSteamCmdVerifyExitAcceptable(null, false)).toBe(false);
  });
});

describe("updateJobNeedsSteamCmdExecutable", () => {
  it("skips post-SteamCMD recovery phases", () => {
    expect(
      updateJobNeedsSteamCmdExecutable({ type: "update", phase: "files-applied" }),
    ).toBe(false);
    expect(
      updateJobNeedsSteamCmdExecutable({
        type: "update",
        phase: "rollback-restoring-backups",
      }),
    ).toBe(false);
    expect(
      updateJobNeedsSteamCmdExecutable({ type: "update", phase: "applying-files" }),
    ).toBe(true);
    expect(
      updateJobNeedsSteamCmdExecutable({ type: "verify-files", phase: "queued" }),
    ).toBe(true);
  });
});
