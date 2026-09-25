import { describe, expect, it } from "vitest";
import type { ImportInstallProbe, ServerInstallationInfo, ServerProfileInput } from "@shared/types";
import {
  canImportInstallProceed,
  applyPreferredCluster,
  emptyImportForm,
  formToProfileInput,
  suggestionsToForm,
} from "../../src/renderer/src/features/servers/importInstallModel";

function installation(health: ServerInstallationInfo["health"]): ServerInstallationInfo {
  return {
    serverId: "import:x",
    installed: health === "ready",
    health,
    reasonCodes: [],
    guidance: "",
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: "C:\\ASA\\Server\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    checkedAt: new Date().toISOString(),
  };
}

function probe(
  overrides: Partial<ImportInstallProbe> & {
    health?: ServerInstallationInfo["health"];
  } = {},
): ImportInstallProbe {
  const health = overrides.health ?? "ready";
  const { health: _h, installation: installationOverride, ...rest } = overrides;
  return {
    installDir: "C:\\ASA\\Server",
    installation: { ...installation(health), ...installationOverride, health },
    suggestions: {
      name: "Server",
      sessionName: "Server",
      map: "TheIsland_WP",
      mapModId: null,
      maxPlayers: 70,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
      adminPassword: "admin",
      serverPassword: null,
      mods: [],
    },
    canContinue: health === "ready",
    nestedSubfolder: false,
    suggestedInstallDir: null,
    alreadyManagedBy: null,
    ...rest,
  };
}

describe("canImportInstallProceed", () => {
  it("allows ready without opt-in", () => {
    expect(canImportInstallProceed(probe({ health: "ready" }), false)).toBe(true);
  });

  it("blocks incomplete until opt-in", () => {
    const incomplete = probe({ health: "incomplete" });
    expect(canImportInstallProceed(incomplete, false)).toBe(false);
    expect(canImportInstallProceed(incomplete, true)).toBe(true);
  });

  it("never unlocks empty or other non-ready with opt-in", () => {
    expect(canImportInstallProceed(probe({ health: "empty" }), true)).toBe(false);
    expect(canImportInstallProceed(probe({ health: "missing" }), true)).toBe(false);
    expect(canImportInstallProceed(probe({ health: "suspicious" }), true)).toBe(false);
  });

  it("blocks managed and nested incomplete even with opt-in", () => {
    expect(canImportInstallProceed(probe({ health: "incomplete", alreadyManagedBy: "Other" }), true)).toBe(false);
    expect(canImportInstallProceed(probe({ health: "incomplete", nestedSubfolder: true }), true)).toBe(false);
  });
});

describe("applyPreferredCluster", () => {
  it("overlays a setup cluster onto probe suggestions", () => {
    const form = suggestionsToForm(probe().suggestions);
    expect(form.clusterId).toBe("");
    expect(
      applyPreferredCluster(form, {
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    ).toMatchObject({
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
    });
    expect(applyPreferredCluster(form, undefined).clusterId).toBe("");
  });
});

describe("formToProfileInput mods (#637)", () => {
  const form = { ...emptyImportForm(), name: "Server", sessionName: "Session", adminPassword: "admin" };

  it("stages scanned mods disabled when the toggle is off", () => {
    const input = formToProfileInput(form, "C:\\ASA", ["111", "222"], {}, false);
    expect("error" in input).toBe(false);
    expect((input as ServerProfileInput).disabledMods).toEqual(["111", "222"]);
  });

  it("imports scanned mods enabled when asked", () => {
    const input = formToProfileInput(form, "C:\\ASA", ["111", "222"], {}, true);
    expect("error" in input).toBe(false);
    expect((input as ServerProfileInput).disabledMods).toEqual([]);
  });
});
