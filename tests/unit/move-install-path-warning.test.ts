import { describe, expect, it } from "vitest";
import type { ImportInstallProbe, ServerInstallationInfo } from "@shared/types";
import {
  moveDestFolderName,
  moveDestPreviewIssue,
  resolveMoveDestDir,
} from "../../src/renderer/src/features/servers/components/MoveInstallDialog/moveInstallPathWarning";

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
      maxPlayers: 70,
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

describe("moveDestPreviewIssue", () => {
  const fleet = [
    { id: "island", name: "The Island", installDir: "C:\\ark\\Island" },
    { id: "rag", name: "Ragnarok", installDir: "C:\\ark\\Ragnarok" },
  ];

  function preview(
    destDir: string,
    disk: ImportInstallProbe | null = null,
  ): string | null {
    return moveDestPreviewIssue({
      sourceDir: "C:\\ark\\Island",
      destDir,
      fleet,
      excludeId: "island",
      probe: disk,
    });
  }

  it("ignores an empty dest", () => {
    expect(preview("")).toBeNull();
  });

  it("rejects dest equal to the current install", () => {
    expect(preview("C:\\ark\\Island")).toMatch(/differ from the current install/i);
  });

  it("rejects dest inside or wrapping the current install", () => {
    expect(preview("C:\\ark\\Island\\Backup")).toMatch(/inside the current install/i);
    expect(preview("C:\\ark")).toMatch(/would contain the current install/i);
  });

  it("rejects dest that conflicts with another fleet install", () => {
    expect(preview("C:\\ark\\Ragnarok")).toMatch(/already uses folder/i);
    expect(preview("C:\\ark\\Ragnarok\\Nested")).toMatch(/inside "Ragnarok"/i);
  });

  it("rejects a drive root", () => {
    expect(preview("H:\\")).toMatch(/not the drive root/i);
  });

  it("allows a missing or empty sibling after probe", () => {
    expect(preview("C:\\ark\\Scorched")).toBeNull();
    expect(
      preview(
        "C:\\ark\\Scorched",
        probe({
          installDir: "C:\\ark\\Scorched",
          installation: installation({ health: "missing", guidance: "" }),
        }),
      ),
    ).toBeNull();
    expect(
      preview(
        "C:\\ark\\Scorched",
        probe({
          installDir: "C:\\ark\\Scorched",
          installation: installation({ health: "empty", guidance: "" }),
        }),
      ),
    ).toBeNull();
  });

  it("resolves create-folder dest from the current install leaf", () => {
    expect(moveDestFolderName("C:\\ark\\Island", "The Island")).toBe("Island");
    expect(resolveMoveDestDir("F:\\Diego", "Island", false)).toBe("F:\\Diego");
    expect(resolveMoveDestDir("F:\\Diego", "Island", true)).toBe("F:\\Diego\\Island");
    expect(resolveMoveDestDir("F:\\Diego\\Island", "Island", true)).toBe(
      "F:\\Diego\\Island",
    );
  });

  it("rejects a non-empty dest after probe", () => {
    expect(
      preview(
        "C:\\ark\\Scorched",
        probe({
          installDir: "C:\\ark\\Scorched",
          installation: installation({ health: "ready", guidance: "" }),
        }),
      ),
    ).toMatch(/not empty/i);
  });
});
