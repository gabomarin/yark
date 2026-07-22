import { describe, expect, it } from "vitest";
import {
  buildLaunchArgs,
  serverBinaryPath,
} from "@backend/domains/instances/launch-args";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "id-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "Mi Isla",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("serverBinaryPath", () => {
  it("apunta al ejecutable dentro de la instalación", () => {
    expect(serverBinaryPath("C:\\asa\\island")).toBe(
      "C:\\asa\\island\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    );
  });
});

describe("buildLaunchArgs", () => {
  it("construye la URL de mapa con parámetros básicos", () => {
    const args = buildLaunchArgs(profile());
    expect(args[0]).toBe(
      "TheIsland_WP?listen?SessionName=Mi Isla?Port=7777?QueryPort=27015?RCONEnabled=True?RCONPort=27020?ServerAdminPassword=admin1234",
    );
  });

  it("incluye ServerPassword solo si está definido", () => {
    const withPass = buildLaunchArgs(profile({ serverPassword: "secreto" }));
    expect(withPass[0]).toContain("?ServerPassword=secreto");
    const withoutPass = buildLaunchArgs(profile());
    expect(withoutPass[0]).not.toContain("ServerPassword");
  });

  it("agrega mods en orden de carga", () => {
    const args = buildLaunchArgs(profile({ mods: ["111", "222"] }));
    expect(args).toContain("-mods=111,222");
  });

  it("agrega flags de cluster cuando hay clusterId y clusterDir", () => {
    const args = buildLaunchArgs(
      profile({ clusterId: "mi-cluster", clusterDir: "C:\\asa\\cluster" }),
    );
    expect(args).toContain("-clusterid=mi-cluster");
    expect(args).toContain("-ClusterDirOverride=C:\\asa\\cluster");
    expect(args).toContain("-NoTransferFromFiltering");
  });

  it("no agrega flags de cluster sin clusterDir", () => {
    const args = buildLaunchArgs(profile({ clusterId: "x", clusterDir: null }));
    expect(args.join(" ")).not.toContain("-clusterid");
  });

  it("agrega argumentos extra al final", () => {
    const args = buildLaunchArgs(profile({ extraArgs: ["-NoBattlEye"] }));
    expect(args[args.length - 1]).toBe("-NoBattlEye");
  });
});
