import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractOfficialVersionFromStatusText,
  inspectServerInstallation,
  parseOfficialServerStatus,
} from "@backend/domains/instances/server-installation";

describe("inspectServerInstallation", () => {
  function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), "ark-install-"));
  }

  it("marks not installed when ArkAscendedServer.exe is missing", () => {
    const installDir = makeTmpDir();
    try {
      const info = inspectServerInstallation("srv-1", installDir);
      expect(info.installed).toBe(false);
      expect(info.health).toBe("empty");
      expect(info.reasonCodes).toContain("dir_empty");
      expect(info.build).toBeNull();
      expect(info.steamBuild).toBeNull();
      expect(info.arkVersion).toBeNull();
      expect(info.version).toBeNull();
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("marks installed when ArkAscendedServer.exe exists", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const info = inspectServerInstallation("srv-2", installDir);
      expect(info.installed).toBe(true);
      expect(info.health).toBe("ready");
      expect(info.reasonCodes).toEqual(["ready"]);
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("reads version from version.txt when present", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");
      writeFileSync(join(binDir, "version.txt"), "v57.18\n");

      const info = inspectServerInstallation("srv-3", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("v57.18");
      expect(info.version).toBe("v57.18");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("reads version from Engine/Build/Build.version when present", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const buildDir = join(installDir, "Engine", "Build");
      mkdirSync(buildDir, { recursive: true });
      writeFileSync(
        join(buildDir, "Build.version"),
        '{"BuildVersion":"57.20","Changelist":123456}',
      );

      const info = inspectServerInstallation("srv-3b", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("57.20");
      expect(info.version).toBe("57.20");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("uses SteamCMD appmanifest buildid when installdir matches", () => {
    const steamRoot = makeTmpDir();
    const installDir = join(steamRoot, "asa", "island");
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const steamAppsDir = join(steamRoot, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "16123456"\n  "installdir" "island"\n}',
      );

      const info = inspectServerInstallation("srv-4", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("build 16123456");
      expect(info.steamBuild).toBeNull();
      expect(info.version).toBe("build 16123456");
    } finally {
      rmSync(steamRoot, { recursive: true, force: true });
    }
  });

  it("ignores ambiguous buildid when multiple manifests do not match", () => {
    const steamRoot = makeTmpDir();
    const extraSteamRoot = makeTmpDir();
    const previousEnv = process.env["ARK_STEAMCMD_DIR"];
    const installDir = join(steamRoot, "asa", "island");
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const steamAppsDir = join(steamRoot, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "9999999"\n  "installdir" "otro-server-a"\n}',
      );

      const extraSteamAppsDir = join(extraSteamRoot, "steamapps");
      mkdirSync(extraSteamAppsDir, { recursive: true });
      writeFileSync(
        join(extraSteamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "8888888"\n  "installdir" "otro-server-b"\n}',
      );
      process.env["ARK_STEAMCMD_DIR"] = extraSteamRoot;

      const info = inspectServerInstallation("srv-5", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBeNull();
      expect(info.steamBuild).toBeNull();
      expect(info.version).toBeNull();
    } finally {
      if (previousEnv === undefined) {
        delete process.env["ARK_STEAMCMD_DIR"];
      } else {
        process.env["ARK_STEAMCMD_DIR"] = previousEnv;
      }
      rmSync(steamRoot, { recursive: true, force: true });
      rmSync(extraSteamRoot, { recursive: true, force: true });
    }
  });

  it("uses buildid as fallback when there are no other version sources", () => {
    const steamRoot = makeTmpDir();
    const installDir = join(steamRoot, "asa", "xsd");
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const steamAppsDir = join(steamRoot, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "19999999"\n  "installdir" "ark-survival-ascended-ds"\n}',
      );

      const info = inspectServerInstallation("srv-5b", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("build 19999999");
      expect(info.steamBuild).toBeNull();
      expect(info.version).toBe("build 19999999");
    } finally {
      rmSync(steamRoot, { recursive: true, force: true });
    }
  });

  it("detects buildid even when steamapps is several levels above", () => {
    const steamRoot = makeTmpDir();
    const installDir = join(steamRoot, "servers", "grupo-a", "island");
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const steamAppsDir = join(steamRoot, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "17123456"\n  "installdir" "island"\n}',
      );

      const info = inspectServerInstallation("srv-6", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("build 17123456");
      expect(info.steamBuild).toBeNull();
      expect(info.version).toBe("build 17123456");
    } finally {
      rmSync(steamRoot, { recursive: true, force: true });
    }
  });

  it("detects buildid when SteamCMD is in a folder outside the server", () => {
    const serverRoot = makeTmpDir();
    const steamRoot = makeTmpDir();
    const previousEnv = process.env["ARK_STEAMCMD_DIR"];
    const installDir = join(serverRoot, "asa", "island");
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const steamAppsDir = join(steamRoot, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "18123456"\n  "installdir" "island"\n}',
      );

      process.env["ARK_STEAMCMD_DIR"] = steamRoot;
      const info = inspectServerInstallation("srv-7", installDir);
      expect(info.installed).toBe(true);
      expect(info.build).toBe("build 18123456");
      expect(info.steamBuild).toBeNull();
      expect(info.version).toBe("build 18123456");
    } finally {
      if (previousEnv === undefined) {
        delete process.env["ARK_STEAMCMD_DIR"];
      } else {
        process.env["ARK_STEAMCMD_DIR"] = previousEnv;
      }
      rmSync(serverRoot, { recursive: true, force: true });
      rmSync(steamRoot, { recursive: true, force: true });
    }
  });

  it("reads arkVersion from the newest log when ARK Version is present", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
      mkdirSync(logsDir, { recursive: true });
      writeFileSync(
        join(logsDir, "ShooterGame.log"),
        "[2026.07.23-12.45.00] Startup\nARK Version: 58.31\nReady",
      );

      const info = inspectServerInstallation("srv-8", installDir);
      expect(info.installed).toBe(true);
      expect(info.arkVersion).toBe("58.31");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("reads arkVersion from the end of a large log without loading the whole file", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const logsDir = join(installDir, "ShooterGame", "Saved", "Logs");
      mkdirSync(logsDir, { recursive: true });
      const prefix = "x".repeat(400 * 1024);
      writeFileSync(
        join(logsDir, "ShooterGame.log"),
        `${prefix}\nARK Version: 59.01\n`,
      );

      const info = inspectServerInstallation("srv-8-tail", installDir, {
        bypassCache: true,
      });
      expect(info.arkVersion).toBe("59.01");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("uses only the synced in-server appmanifest as the comparable build", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");
      const steamAppsDir = join(installDir, "steamapps");
      mkdirSync(steamAppsDir, { recursive: true });
      writeFileSync(
        join(steamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "24346423"\n  "installdir" "ARK Survival Ascended Dedicated Server"\n}',
      );

      const info = inspectServerInstallation("srv-9", installDir);
      expect(info.steamBuild).toBe("build 24346423");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("classifies missing install paths", () => {
    const info = inspectServerInstallation(
      "srv-missing",
      join(tmpdir(), `ark-missing-${Date.now()}-${Math.random()}`),
      { bypassCache: true },
    );
    expect(info.health).toBe("missing");
    expect(info.installed).toBe(false);
    expect(info.reasonCodes).toContain("path_missing");
  });

  it("classifies incomplete trees without the executable", () => {
    const installDir = makeTmpDir();
    try {
      mkdirSync(join(installDir, "ShooterGame", "Binaries", "Win64"), {
        recursive: true,
      });
      const info = inspectServerInstallation("srv-incomplete", installDir, {
        bypassCache: true,
      });
      expect(info.health).toBe("incomplete");
      expect(info.installed).toBe(false);
      expect(info.reasonCodes).toContain("exe_absent");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("classifies empty non-ASA directories", () => {
    const installDir = makeTmpDir();
    try {
      writeFileSync(join(installDir, "readme.txt"), "not asa");
      const info = inspectServerInstallation("srv-empty-markers", installDir, {
        bypassCache: true,
      });
      expect(info.health).toBe("empty");
      expect(info.reasonCodes).toContain("asa_markers_absent");
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("classifies zero-byte executables as suspicious", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "");
      const info = inspectServerInstallation("srv-empty-exe", installDir, {
        bypassCache: true,
      });
      expect(info.health).toBe("suspicious");
      expect(info.reasonCodes).toContain("exe_empty");
      expect(info.installed).toBe(false);
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });
});

describe("parseOfficialServerStatus", () => {
  it("reads the published version from the official Wildcard status", () => {
    expect(
      parseOfficialServerStatus(
        'ARK Official Server Network Status: <RichColor Color="0, 1, 0, 1">Online (v92.21)</>',
      ),
    ).toEqual({ version: "92.21", networkStatus: "online" });
  });

  it("detects Deploying and Offline statuses", () => {
    expect(parseOfficialServerStatus("Deploying (v93.4)")).toEqual({
      version: "93.4",
      networkStatus: "deploying",
    });
    expect(
      parseOfficialServerStatus(
        'ARK Official Server Network Status: <RichColor Color="1, 0, 0, 1">Offline (v92.21)</>',
      ),
    ).toEqual({ version: "92.21", networkStatus: "offline" });
    expect(
      extractOfficialVersionFromStatusText("ARK Official Server Network Status: Offline"),
    ).toBeNull();
  });
});
