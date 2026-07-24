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
    sessionName: "My Island",
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

  it("creates and retrieves a profile with all fields", () => {
    const created = repo.create(input());
    const fetched = repo.get(created.id);
    expect(fetched).toEqual(created);
    expect(fetched!.mods).toEqual(["111", "222"]);
    expect(fetched!.extraArgs).toEqual(["-NoBattlEye"]);
  });

  it("lists profiles sorted by name", () => {
    repo.create(input({ name: "Zeta", gamePort: 7787, queryPort: 27025, rconPort: 27030 }));
    repo.create(input({ name: "Alpha" }));
    const names = repo.list().map((p) => p.name);
    expect(names).toEqual(["Alpha", "Zeta"]);
  });

  it("updates an existing profile", () => {
    const created = repo.create(input());
    const updated = repo.update(created.id, input({ name: "Renamed" }));
    expect(updated!.name).toBe("Renamed");
    expect(updated!.id).toBe(created.id);
  });

  it("returns null when updating a nonexistent id", () => {
    expect(repo.update("does-not-exist", input())).toBeNull();
  });

  it("deletes a profile", () => {
    const created = repo.create(input());
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.delete(created.id)).toBe(false);
  });

  it("rejects duplicate names via UNIQUE constraint", () => {
    repo.create(input());
    expect(() =>
      repo.create(input({ gamePort: 7787, queryPort: 27025, rconPort: 27030 })),
    ).toThrow();
  });

  it("records and retrieves recent events in descending order", () => {
    repo.addEvent(null, "server_created", "info", "First");
    repo.addEvent(null, "server_updated", "info", "Second");
    const events = repo.recentEvents(10);
    expect(events).toHaveLength(2);
    expect(events[0]!.message).toBe("Second");
  });
});
