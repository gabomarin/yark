import { describe, expect, it } from "vitest";
import { getServerUpdateState } from "@shared/server-update-status";
import type { ServerInstallationInfo } from "@shared/types";

function installation(
  overrides: Partial<ServerInstallationInfo> = {},
): ServerInstallationInfo {
  return {
    serverId: "srv-1",
    installed: true,
    build: "build 24346423",
    steamBuild: "build 24346423",
    arkVersion: "92.21",
    officialVersion: "92.23",
    officialSteamBuild: "build 24346423",
    version: "build 24346423",
    binaryPath: "C:/ARK/ArkAscendedServer.exe",
    checkedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("getServerUpdateState", () => {
  it("ignores ARK version differences when Steam builds match", () => {
    expect(getServerUpdateState(installation())).toBe("current");
  });

  it("marks update only when comparable Steam builds differ", () => {
    expect(
      getServerUpdateState(
        installation({ steamBuild: "build 24300000" }),
      ),
    ).toBe("available");
  });

  it("does not invent a state when a comparable build is missing", () => {
    expect(
      getServerUpdateState(installation({ officialSteamBuild: null })),
    ).toBe("unknown");
    expect(
      getServerUpdateState(installation({ installed: false })),
    ).toBe("unknown");
  });
});
