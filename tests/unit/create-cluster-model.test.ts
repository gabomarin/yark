import { describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import {
  buildCreateClusterInput,
  getClusterDirFormError,
  getClusterIdFormError,
  getSelectedMembersPortError,
  ineligibilityReason,
  listCreateClusterCandidates,
  pruneSelectedServerIds,
  sharedPrefillClusterDir,
  suggestClusterId,
  toggleSelectedServerId,
} from "../../src/renderer/src/features/clusters/createClusterModel";

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

describe("createClusterModel", () => {
  it("marks running and already-clustered servers ineligible", () => {
    const running = makeServer({ id: "a", name: "A" });
    const member = makeServer({
      id: "b",
      name: "B",
      clusterId: "alpha",
      clusterDir: "D:\\ASA\\Clusters\\Alpha",
    });
    const eligible = makeServer({ id: "c", name: "C" });

    const statuses = new Map([
      ["a", { status: "running" as const }],
      ["b", { status: "stopped" as const }],
      ["c", { status: "stopped" as const }],
    ]);

    expect(ineligibilityReason(running, "running")).toBe("Server must be stopped");
    expect(ineligibilityReason(member, "stopped")).toMatch(/Already in cluster/);

    const candidates = listCreateClusterCandidates(
      [running, member, eligible],
      statuses,
    );
    expect(candidates.find((c) => c.server.id === "c")?.eligible).toBe(true);
    expect(candidates.find((c) => c.server.id === "a")?.eligible).toBe(false);
    expect(candidates.find((c) => c.server.id === "b")?.eligible).toBe(false);
  });

  it("toggles multi-select ids and prefills a shared directory", () => {
    expect(toggleSelectedServerId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelectedServerId(["a", "b"], "a")).toEqual(["b"]);
    expect(
      sharedPrefillClusterDir([
        makeServer({ id: "a", name: "A", clusterDir: "D:\\Shared" }),
        makeServer({ id: "b", name: "B", clusterDir: "D:\\Shared" }),
      ]),
    ).toBe("D:\\Shared");
    expect(
      sharedPrefillClusterDir([
        makeServer({ id: "a", name: "A", clusterDir: "D:\\A" }),
        makeServer({ id: "b", name: "B", clusterDir: "D:\\B" }),
      ]),
    ).toBeNull();
  });

  it("prunes selected ids that are no longer eligible", () => {
    const candidates = listCreateClusterCandidates(
      [
        makeServer({ id: "a", name: "A" }),
        makeServer({ id: "b", name: "B" }),
        makeServer({
          id: "c",
          name: "C",
          clusterId: "taken",
          clusterDir: "D:\\X",
        }),
      ],
      new Map([
        ["a", { status: "stopped" as const }],
        ["b", { status: "running" as const }],
        ["c", { status: "stopped" as const }],
      ]),
    );
    expect(pruneSelectedServerIds(["a", "b", "c"], candidates)).toEqual(["a"]);
  });

  it("blocks selected members that share ports", () => {
    const a = makeServer({
      id: "a",
      name: "A",
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
    });
    const b = makeServer({
      id: "b",
      name: "B",
      gamePort: 7777,
      queryPort: 27017,
      rconPort: 27022,
    });
    expect(getSelectedMembersPortError([a, b])).toMatch(/game port 7777/i);
    expect(
      getSelectedMembersPortError([
        a,
        makeServer({
          id: "c",
          name: "C",
          gamePort: 7779,
          queryPort: 27017,
          rconPort: 27022,
        }),
      ]),
    ).toBeNull();
  });

  it("detects case-insensitive cluster ID conflicts and dir mismatches", () => {
    const servers = [
      makeServer({
        id: "a",
        name: "A",
        clusterId: "Ark-PVE",
        clusterDir: "D:\\ASA\\Clusters\\PVE",
      }),
    ];

    expect(getClusterIdFormError("", "D:\\ASA\\Clusters\\New", servers)).toMatch(
      /required/i,
    );
    expect(
      getClusterIdFormError("ark-pve", "D:\\ASA\\Clusters\\Other", servers),
    ).toMatch(/different directory/i);
    expect(
      getClusterIdFormError("ark-pve", "D:\\ASA\\Clusters\\PVE", servers),
    ).toMatch(/already exists/i);
    expect(
      getClusterIdFormError("fresh-id", "D:\\ASA\\Clusters\\New", servers),
    ).toBeNull();
  });

  it("validates Windows absolute cluster directories", () => {
    expect(getClusterDirFormError("")).toMatch(/required/i);
    expect(getClusterDirFormError("relative\\path")).toMatch(/absolute/i);
    expect(getClusterDirFormError("D:/ASA/Clusters/Ember")).toBeNull();
  });

  it("builds a normalized create-cluster profile input", () => {
    const server = makeServer({ id: "a", name: "Island", mods: ["123"] });
    const input = buildCreateClusterInput(
      server,
      "  ember-nexus  ",
      "D:/ASA/Clusters/Ember/",
    );
    expect(input.clusterId).toBe("ember-nexus");
    expect(input.clusterDir).toBe("D:\\ASA\\Clusters\\Ember");
    expect(input.mods).toEqual(["123"]);
    expect(input.name).toBe("Island");
  });

  it("suggests a unique cluster id", () => {
    const a = suggestClusterId();
    const b = suggestClusterId();
    expect(a.length).toBeGreaterThan(8);
    expect(b.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });
});
