import { describe, expect, it } from "vitest";
import { deriveServerCardView } from "@features/servers/components/ServerCard/serverCardPresentationModel";

describe("deriveServerCardView stop progress", () => {
  it("prefers stop progress copy and Stopping label when stopBusy", () => {
    const view = deriveServerCardView({
      status: "stopping",
      installation: {
        serverId: "srv-1",
        installed: true,
        health: "ready",
        reasonCodes: ["ready"],
        guidance: "Installation looks ready to start.",
        build: null,
        steamBuild: null,
        arkVersion: null,
        version: null,
        binaryPath: "C:/ARK/bin/ArkAscendedServer.exe",
        checkedAt: "2026-07-23T00:00:00.000Z",
      },
      officialSteamBuild: "build 1",
      steamCmdBusy: false,
      stopBusy: true,
      steamCmdOperation: null,
      steamCmdProgressLabel: null,
      steamCmdProgressBytesDownloaded: null,
      steamCmdProgressBytesTotal: null,
      stopProgressLabel: "Saving world…",
    });

    expect(view.installStateLabel).toBe("Stopping…");
    expect(view.rowTone).toBe("busy");
    expect(view.progress.shortProgressLabel).toBe("Saving world…");
    expect(view.progress.byteProgressLabel).toBeNull();
  });
});
