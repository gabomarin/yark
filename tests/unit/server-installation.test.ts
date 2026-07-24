import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractOfficialVersionFromStatusText,
  inspectServerInstallation,
} from "@backend/domains/instances/server-installation";

describe("inspectServerInstallation", () => {
  function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), "ark-install-"));
  }

  it("marca no instalado cuando no existe ArkAscendedServer.exe", () => {
    const installDir = makeTmpDir();
    try {
      const info = inspectServerInstallation("srv-1", installDir);
      expect(info.installed).toBe(false);
      expect(info.build).toBeNull();
      expect(info.steamBuild).toBeNull();
      expect(info.arkVersion).toBeNull();
      expect(info.version).toBeNull();
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("marca instalado cuando existe ArkAscendedServer.exe", () => {
    const installDir = makeTmpDir();
    try {
      const binDir = join(installDir, "ShooterGame", "Binaries", "Win64");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "ArkAscendedServer.exe"), "fake-binary");

      const info = inspectServerInstallation("srv-2", installDir);
      expect(info.installed).toBe(true);
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  });

  it("lee version desde version.txt cuando existe", () => {
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

  it("lee version desde Engine/Build/Build.version cuando existe", () => {
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

  it("usa buildid de appmanifest de SteamCMD si coincide con installdir", () => {
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

  it("ignora buildid ambiguo cuando hay múltiples manifests no coincidentes", () => {
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
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "9999999"\n  "installdir" "otro-servidor-a"\n}',
      );

      const extraSteamAppsDir = join(extraSteamRoot, "steamapps");
      mkdirSync(extraSteamAppsDir, { recursive: true });
      writeFileSync(
        join(extraSteamAppsDir, "appmanifest_2430930.acf"),
        '"AppState"\n{\n  "appid" "2430930"\n  "buildid" "8888888"\n  "installdir" "otro-servidor-b"\n}',
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

  it("usa buildid como fallback cuando no hay otras fuentes de versión", () => {
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

  it("detecta buildid aunque steamapps esté varios niveles arriba", () => {
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

  it("detecta buildid cuando SteamCMD está en una carpeta externa al servidor", () => {
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

  it("lee arkVersion desde el log más reciente cuando existe ARK Version", () => {
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

  it("usa como build comparable solo el appmanifest sincronizado dentro del servidor", () => {
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
});

describe("extractOfficialVersionFromStatusText", () => {
  it("lee la versión publicada en el estado oficial de Wildcard", () => {
    expect(
      extractOfficialVersionFromStatusText(
        'ARK Official Server Network Status: <RichColor Color="0, 1, 0, 1">Online (v92.21)</>',
      ),
    ).toBe("92.21");
  });

  it("tolera otros estados de red y rechaza contenido sin versión", () => {
    expect(
      extractOfficialVersionFromStatusText("Deploying (v93.4)"),
    ).toBe("93.4");
    expect(
      extractOfficialVersionFromStatusText("ARK Official Server Network Status: Offline"),
    ).toBeNull();
  });
});
