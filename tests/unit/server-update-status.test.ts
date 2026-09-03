import { describe, expect, it } from "vitest";
import { getServerUpdateState } from "@shared/server-update-status";
import type { ServerInstallationInfo } from "@shared/types";
import { stubInstallationInfo } from "../helpers/installation-info";

function installation(
  overrides: Partial<ServerInstallationInfo> = {},
): ServerInstallationInfo {
  return stubInstallationInfo({
    serverId: "srv-1",
    installed: true,
    health: "ready",
    build: "build 24346423",
    steamBuild: "build 24346423",
    arkVersion: "92.21",
    version: "build 24346423",
    binaryPath: "C:/ARK/ArkAscendedServer.exe",
    checkedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
    ...(overrides.installed === false && overrides.health == null
      ? { health: "missing" as const, reasonCodes: ["path_missing"] }
      : {}),
  });
}

describe("getServerUpdateState", () => {
  it("ignores ARK version differences when Steam builds match", () => {
    expect(getServerUpdateState(installation(), "build 24346423")).toBe("current");
  });

  it("marks update only when the local Steam build is behind official", () => {
    expect(
      getServerUpdateState(
        installation({ steamBuild: "build 24300000" }),
        "build 24346423",
      ),
    ).toBe("available");
  });

  it("treats a local Steam build ahead of the official probe as current (#490)", () => {
    expect(
      getServerUpdateState(
        installation({ steamBuild: "build 25000000" }),
        "build 24346423",
      ),
    ).toBe("current");
  });

  it("does not invent a state when a comparable build is missing", () => {
    expect(getServerUpdateState(installation(), null)).toBe("unknown");
    expect(
      getServerUpdateState(installation({ installed: false }), "build 24346423"),
    ).toBe("unknown");
  });
});
