import { describe, expect, it } from "vitest";
import { buildMapUrlArg } from "@shared/launch-map-url";
import type { ServerProfile } from "@shared/types";
import {
  joinRawExtraArgs,
  parseRawExtraArgs,
  yarkOwnedPreviewTokens,
} from "@features/server-workspace/components/ServerLaunchPanel/serverLaunchModel";

function profile(partial: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-a",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    structuredLaunchArgs: {},
    mods: [],
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("parseRawExtraArgs", () => {
  it("keeps double-quoted values with spaces as one token", () => {
    expect(
      parseRawExtraArgs('-CustomNotificationURL="hello world" -NoBattlEye'),
    ).toEqual(["-CustomNotificationURL=\"hello world\"", "-NoBattlEye"]);
  });

  it("preserves escaped quotes inside a quoted span", () => {
    expect(parseRawExtraArgs('-Name="say \\"hi\\"" -x')).toEqual([
      '-Name="say \\"hi\\""',
      "-x",
    ]);
  });

  it("round-trips through joinRawExtraArgs for quoted tokens", () => {
    const raw = '-CustomNotificationURL="hello world" -NoBattlEye';
    expect(joinRawExtraArgs(parseRawExtraArgs(raw))).toBe(raw);
  });
});

describe("yarkOwnedPreviewTokens", () => {
  it("escapes sessionName the same way as buildMapUrlArg / spawn", () => {
    const server = profile({ sessionName: 'Gabo "server"\\path' });
    const tokens = yarkOwnedPreviewTokens(server);
    expect(tokens[0]).toBe(buildMapUrlArg(server.map, server.sessionName));
    expect(tokens[0]).toBe(
      '"TheIsland_WP"?SessionName="Gabo \\"server\\"\\\\path"',
    );
  });
});
