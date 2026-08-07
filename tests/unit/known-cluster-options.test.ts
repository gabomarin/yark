import { describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import { listKnownClusterOptions } from "@features/clusters/knownClusterOptions";

function profile(
  partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">,
): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
    sessionName: partial.name,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
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

describe("listKnownClusterOptions", () => {
  it("dedupes by clusterId and skips incomplete pairs", () => {
    const options = listKnownClusterOptions([
      profile({
        id: "a",
        name: "Island",
        clusterId: "alpha",
        clusterDir: "C:\\cluster\\alpha",
      }),
      profile({
        id: "b",
        name: "Scorched",
        clusterId: "alpha",
        clusterDir: "C:\\cluster\\alpha",
      }),
      profile({ id: "c", name: "NoId", clusterDir: "C:\\orphan" }),
      profile({ id: "d", name: "NoDir", clusterId: "beta" }),
    ]);

    expect(options).toEqual([
      {
        clusterId: "alpha",
        clusterDir: "C:\\cluster\\alpha",
        label: "alpha · via Island",
      },
    ]);
  });

  it("can exclude a server id", () => {
    const options = listKnownClusterOptions(
      [
        profile({
          id: "self",
          name: "Self",
          clusterId: "alpha",
          clusterDir: "C:\\cluster\\alpha",
        }),
        profile({
          id: "other",
          name: "Other",
          clusterId: "beta",
          clusterDir: "C:\\cluster\\beta",
        }),
      ],
      { excludeServerId: "self" },
    );

    expect(options.map((option) => option.clusterId)).toEqual(["beta"]);
  });
});
