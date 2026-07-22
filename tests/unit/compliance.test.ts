import { describe, expect, it } from "vitest";
import { checkClusterCompliance } from "@backend/domains/cluster/compliance";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile>): ServerProfile {
  return {
    id: "id",
    name: "Server",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "Sesión",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: "cluster-1",
    clusterDir: "C:\\asa\\cluster",
    extraArgs: [],
    mods: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkClusterCompliance", () => {
  it("marca ok un cluster de dos mapas bien configurado", () => {
    const reports = checkClusterCompliance([
      profile({ id: "a", name: "Island", map: "TheIsland_WP" }),
      profile({
        id: "b",
        name: "Scorched",
        map: "ScorchedEarth_WP",
        gamePort: 7787,
        queryPort: 27025,
        rconPort: 27030,
      }),
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.ok).toBe(true);
    expect(reports[0]!.members).toEqual(["a", "b"]);
  });

  it("ignora servidores sin cluster", () => {
    const reports = checkClusterCompliance([
      profile({ id: "a", clusterId: null, clusterDir: null }),
    ]);
    expect(reports).toEqual([]);
  });

  it("advierte cuando el cluster tiene un solo miembro", () => {
    const reports = checkClusterCompliance([profile({ id: "a" })]);
    expect(reports[0]!.ok).toBe(true);
    expect(
      reports[0]!.issues.some(
        (i) => i.severity === "warning" && i.message.includes("un solo miembro"),
      ),
    ).toBe(true);
  });

  it("marca error cuando los directorios de cluster difieren", () => {
    const reports = checkClusterCompliance([
      profile({ id: "a", name: "A" }),
      profile({
        id: "b",
        name: "B",
        clusterDir: "D:\\otro\\cluster",
        gamePort: 7787,
        queryPort: 27025,
        rconPort: 27030,
      }),
    ]);
    expect(reports[0]!.ok).toBe(false);
    expect(
      reports[0]!.issues.some((i) => i.message.includes("directorios de cluster distintos")),
    ).toBe(true);
  });

  it("marca error por conflicto de puertos dentro del cluster", () => {
    const reports = checkClusterCompliance([
      profile({ id: "a", name: "A" }),
      profile({ id: "b", name: "B", map: "ScorchedEarth_WP" }),
    ]);
    expect(reports[0]!.ok).toBe(false);
    expect(
      reports[0]!.issues.some((i) => i.message.includes("Conflicto de puerto")),
    ).toBe(true);
  });

  it("advierte cuando las listas de mods difieren entre miembros", () => {
    const reports = checkClusterCompliance([
      profile({ id: "a", name: "A", mods: ["1", "2"] }),
      profile({
        id: "b",
        name: "B",
        map: "ScorchedEarth_WP",
        mods: ["1"],
        gamePort: 7787,
        queryPort: 27025,
        rconPort: 27030,
      }),
    ]);
    expect(
      reports[0]!.issues.some(
        (i) => i.severity === "warning" && i.message.includes("mods distintas"),
      ),
    ).toBe(true);
  });
});
