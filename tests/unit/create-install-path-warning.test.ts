import { describe, expect, it } from "vitest";
import type { ImportInstallProbe, ServerInstallationInfo } from "@shared/types";
import {
  diskCreateInstallWarning,
  fleetCreateInstallWarning,
} from "../../src/renderer/src/features/servers/components/ServerForm/createInstallPathWarning";

function installation(
  partial: Partial<ServerInstallationInfo> &
    Pick<ServerInstallationInfo, "health" | "guidance">,
): ServerInstallationInfo {
  return {
    serverId: "probe",
    installed: false,
    reasonCodes: [],
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: "C:\\ark\\New\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    checkedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function probe(partial: Partial<ImportInstallProbe> & { installDir?: string }): ImportInstallProbe {
  const installDir = partial.installDir ?? "C:\\ark\\New";
  return {
    installDir,
    installation: installation({ health: "empty", guidance: "" }),
    suggestions: {
      name: "New",
      sessionName: "New",
      map: "TheIsland_WP",
      mapModId: null,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
      adminPassword: "admin",
      serverPassword: null,
      mods: [],
    },
    canContinue: false,
    nestedSubfolder: false,
    suggestedInstallDir: null,
    alreadyManagedBy: null,
    ...partial,
  };
}

describe("createInstallPathWarning", () => {
  const fleet = [{ name: "The Island", installDir: "C:\\ark\\Island" }];

  it("allows a sibling folder", () => {
    expect(fleetCreateInstallWarning("C:\\ark\\Ragnarok", fleet)).toBeNull();
  });

  it("rejects a path inside another YARK install", () => {
    expect(fleetCreateInstallWarning("C:\\ark\\Island\\Nested", fleet)).toMatch(
      /inside "The Island"/i,
    );
  });

  it("rejects a path that would contain another YARK install", () => {
    expect(fleetCreateInstallWarning("C:\\ark", fleet)).toMatch(/contain "The Island"/i);
  });

  it("rejects the same folder as another server", () => {
    expect(fleetCreateInstallWarning("C:\\ark\\Island", fleet)).toMatch(/already uses folder/i);
  });

  it("allows missing or empty disk probes", () => {
    expect(
      diskCreateInstallWarning(
        probe({ installation: installation({ health: "missing", guidance: "" }) }),
      ),
    ).toBeNull();
    expect(
      diskCreateInstallWarning(probe({ installation: installation({ health: "empty", guidance: "" }) })),
    ).toBeNull();
  });

  it("rejects nested ShooterGame and non-empty trees", () => {
    expect(
      diskCreateInstallWarning(
        probe({
          nestedSubfolder: true,
          installation: installation({
            health: "suspicious",
            guidance: "This is inside an ASA install. Select C:\\ark\\Island.",
          }),
        }),
      ),
    ).toMatch(/inside an ASA install/i);
    expect(
      diskCreateInstallWarning(
        probe({ installation: installation({ health: "ready", guidance: "" }) }),
      ),
    ).toMatch(/not empty/i);
  });
});
