import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfileInput } from "@shared/types";

function input(overrides: Partial<ServerProfileInput> = {}): ServerProfileInput {
  return {
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "Mi Isla",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: "cluster-1",
    clusterDir: "C:\\asa\\cluster",
    extraArgs: ["-NoBattlEye"],
    mods: ["111", "222"],
    ...overrides,
  };
}

describe("ServerRepository", () => {
  let db: DatabaseSync;
  let repo: ServerRepository;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new ServerRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("crea y recupera un perfil con todos los campos", () => {
    const created = repo.create(input());
    const fetched = repo.get(created.id);
    expect(fetched).toEqual(created);
    expect(fetched!.mods).toEqual(["111", "222"]);
    expect(fetched!.extraArgs).toEqual(["-NoBattlEye"]);
  });

  it("lista perfiles ordenados por nombre", () => {
    repo.create(input({ name: "Zeta", gamePort: 7787, queryPort: 27025, rconPort: 27030 }));
    repo.create(input({ name: "Alfa" }));
    const names = repo.list().map((p) => p.name);
    expect(names).toEqual(["Alfa", "Zeta"]);
  });

  it("actualiza un perfil existente", () => {
    const created = repo.create(input());
    const updated = repo.update(created.id, input({ name: "Renombrado" }));
    expect(updated!.name).toBe("Renombrado");
    expect(updated!.id).toBe(created.id);
  });

  it("devuelve null al actualizar un id inexistente", () => {
    expect(repo.update("no-existe", input())).toBeNull();
  });

  it("elimina un perfil", () => {
    const created = repo.create(input());
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.delete(created.id)).toBe(false);
  });

  it("rechaza nombres duplicados por restricción UNIQUE", () => {
    repo.create(input());
    expect(() =>
      repo.create(input({ gamePort: 7787, queryPort: 27025, rconPort: 27030 })),
    ).toThrow();
  });

  it("registra y recupera eventos recientes en orden descendente", () => {
    repo.addEvent(null, "server_created", "info", "Primero");
    repo.addEvent(null, "server_updated", "info", "Segundo");
    const events = repo.recentEvents(10);
    expect(events).toHaveLength(2);
    expect(events[0]!.message).toBe("Segundo");
  });
});
