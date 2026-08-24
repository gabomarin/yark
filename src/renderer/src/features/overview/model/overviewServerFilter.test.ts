import { describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import {
  filterOverviewServers,
  partitionOverviewServers,
} from "./overviewServerFilter";

const base: Omit<ServerProfile, "id" | "name" | "enabled" | "clusterId"> = {
  map: "TheIsland_WP",
  installDir: "C:/ARK",
  autoStart: false,
  sessionName: "s",
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function server(partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  return {
    ...base,
    enabled: true,
    clusterId: null,
    ...partial,
  };
}

describe("overviewServerFilter", () => {
  it("partitions enabled vs disabled", () => {
    const result = partitionOverviewServers([
      server({ id: "a", name: "A", enabled: true }),
      server({ id: "b", name: "B", enabled: false }),
    ]);
    expect(result.enabled.map((s) => s.id)).toEqual(["a"]);
    expect(result.disabled.map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by name, map, or cluster id", () => {
    const servers = [
      server({ id: "1", name: "The Island", map: "TheIsland_WP", clusterId: "alpha" }),
      server({ id: "2", name: "Scorched", map: "ScorchedEarth_WP", clusterId: null }),
    ];
    expect(filterOverviewServers(servers, "island").map((s) => s.id)).toEqual(["1"]);
    expect(filterOverviewServers(servers, "scorched").map((s) => s.id)).toEqual(["2"]);
    expect(filterOverviewServers(servers, "alpha").map((s) => s.id)).toEqual(["1"]);
    expect(filterOverviewServers(servers, "  ").map((s) => s.id)).toEqual(["1", "2"]);
  });
});
