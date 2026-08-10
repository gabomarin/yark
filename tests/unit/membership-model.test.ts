import { describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import {
  addIneligibilityReason,
  buildLeaveClusterInput,
  canAddServersToCluster,
  getJoinPortError,
  listAddCandidates,
  listRemoveCandidates,
  modsMayDiverge,
  remainingMemberCountAfterRemove,
} from "@features/clusters/membershipModel";

function makeServer(
  overrides: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">,
): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: `C:\\ARK\\${overrides.id}`,
    sessionName: overrides.name,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    enabled: true,
    autoStart: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("membershipModel", () => {
  it("allows add only when members share one cluster directory", () => {
    const a = makeServer({
      id: "a",
      name: "A",
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
    });
    const b = makeServer({
      id: "b",
      name: "B",
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
    });
    const mixed = makeServer({
      id: "c",
      name: "C",
      clusterId: "ember",
      clusterDir: "D:\\Other",
    });
    expect(canAddServersToCluster([a, b])).toBe(true);
    expect(canAddServersToCluster([a, mixed])).toBe(false);
    expect(canAddServersToCluster([])).toBe(false);
  });

  it("lists add candidates with cluster-aware ineligibility", () => {
    const free = makeServer({ id: "free", name: "Free" });
    const here = makeServer({
      id: "here",
      name: "Here",
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
    });
    const other = makeServer({
      id: "other",
      name: "Other",
      clusterId: "other-id",
      clusterDir: "D:\\Other",
    });
    const running = makeServer({ id: "run", name: "Run" });
    const statuses = new Map([
      ["free", { status: "stopped" as const }],
      ["here", { status: "stopped" as const }],
      ["other", { status: "stopped" as const }],
      ["run", { status: "running" as const }],
    ]);

    expect(addIneligibilityReason(here, "stopped", "ember")).toBe(
      "Already in this cluster",
    );
    expect(addIneligibilityReason(other, "stopped", "ember")).toMatch(
      /Already in cluster/,
    );

    const candidates = listAddCandidates(
      "ember",
      [free, here, other, running],
      statuses,
    );
    expect(candidates.find((c) => c.server.id === "free")?.eligible).toBe(true);
    expect(candidates.find((c) => c.server.id === "here")?.eligible).toBe(false);
    expect(candidates.find((c) => c.server.id === "other")?.eligible).toBe(false);
    expect(candidates.find((c) => c.server.id === "run")?.eligible).toBe(false);
  });

  it("blocks join when ports conflict with current members", () => {
    const member = makeServer({
      id: "m",
      name: "Member",
      clusterId: "ember",
      clusterDir: "D:\\ASA\\Clusters\\Ember",
      gamePort: 7777,
    });
    const joining = makeServer({
      id: "j",
      name: "Joining",
      gamePort: 7777,
      queryPort: 27016,
      rconPort: 27021,
    });
    expect(getJoinPortError([member], [joining])).toMatch(/game port 7777/);
    expect(
      getJoinPortError(
        [member],
        [
          makeServer({
            id: "ok",
            name: "Ok",
            gamePort: 7779,
            queryPort: 27017,
            rconPort: 27022,
          }),
        ],
      ),
    ).toBeNull();
  });

  it("detects mod-list divergence and builds leave input", () => {
    const member = makeServer({
      id: "m",
      name: "Member",
      mods: ["1", "2"],
    });
    const joining = makeServer({ id: "j", name: "Joining", mods: ["1"] });
    expect(modsMayDiverge([member], [joining])).toBe(true);
    expect(
      modsMayDiverge([member], [makeServer({ id: "j2", name: "J2", mods: ["1", "2"] })]),
    ).toBe(false);

    const leave = buildLeaveClusterInput(
      makeServer({
        id: "m",
        name: "Member",
        clusterId: "ember",
        clusterDir: "D:\\ASA\\Clusters\\Ember",
      }),
    );
    expect(leave.clusterId).toBeNull();
    expect(leave.clusterDir).toBeNull();
    expect(remainingMemberCountAfterRemove(3, 2)).toBe(1);
  });

  it("lists remove candidates requiring stopped status", () => {
    const stopped = makeServer({ id: "s", name: "Stopped" });
    const running = makeServer({ id: "r", name: "Running" });
    const candidates = listRemoveCandidates(
      [stopped, running],
      new Map([
        ["s", { status: "stopped" }],
        ["r", { status: "running" }],
      ]),
    );
    expect(candidates.find((c) => c.server.id === "s")?.eligible).toBe(true);
    expect(candidates.find((c) => c.server.id === "r")?.eligible).toBe(false);
  });
});
