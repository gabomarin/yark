import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { backfillMaxPlayersFromLegacyLaunchArgs } from "@backend/infra/db/backfill-max-players";
import {
  coerceMapModId,
  ServerRepository,
} from "@backend/infra/db/server-repository";
import type { ServerProfileInput } from "@shared/types";

function input(overrides: Partial<ServerProfileInput> = {}): ServerProfileInput {
  return {
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "My Island",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: "cluster-1",
    clusterDir: "C:\\asa\\cluster",
    extraArgs: ["-NoBattlEye"],
    mods: ["111", "222"],
    autoStart: false,
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
    expect(fetched!.disabledMods).toEqual([]);
    expect(fetched!.modMetadataCache).toEqual({});
    expect(fetched!.extraArgs).toEqual(["-NoBattlEye"]);
    expect(fetched!.autoStart).toBe(false);
    expect(fetched!.enabled).toBe(true);
  });

  it("persists autoStart on create and update", () => {
    const created = repo.create(input({ autoStart: true }));
    expect(created.autoStart).toBe(true);
    const updated = repo.update(created.id, input({ autoStart: false, name: "Island" }));
    expect(updated!.autoStart).toBe(false);
  });

  it("coerces numeric SQLite map_mod_id values to strings (#190)", () => {
    expect(coerceMapModId(962796)).toBe("962796");
    expect(coerceMapModId(" 962796 ")).toBe("962796");
    expect(coerceMapModId(null)).toBeNull();
    expect(coerceMapModId("")).toBeNull();
  });

  it("persists mapModId for custom maps and official-token remasters (#190)", () => {
    const created = repo.create(
      input({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: ["962796"],
      }),
    );
    expect(created.mapModId).toBe("962796");
    expect(repo.get(created.id)?.mapModId).toBe("962796");

    const reforged = repo.update(
      created.id,
      input({
        map: "TheIsland_WP",
        mapModId: "1460513",
        mods: ["1460513"],
      }),
    );
    expect(reforged!.mapModId).toBe("1460513");

    const official = repo.update(
      created.id,
      input({
        map: "TheIsland_WP",
        mapModId: null,
        mods: [],
      }),
    );
    expect(official!.mapModId).toBeNull();
  });

  it("persists disabled mods and metadata cache", () => {
    const created = repo.create(
      input({
        disabledMods: ["222"],
        modMetadataCache: {
          "111": {
            id: "111",
            name: "Demo",
            summary: "Demo mod",
            thumbnailUrl: null,
            authors: ["A"],
            downloadCount: 1,
            dateModified: "2026-01-01T00:00:00.000Z",
            curseforgeUrl:
              "https://www.curseforge.com/ark-survival-ascended/mods/demo",
            slug: "demo",
          },
        },
      }),
    );
    expect(repo.get(created.id)?.disabledMods).toEqual(["222"]);
    expect(repo.get(created.id)?.modMetadataCache?.["111"]?.slug).toBe("demo");
  });

  it("lists profiles sorted by created_at oldest first, tie-break id", () => {
    const older = repo.create(
      input({ name: "Zeta", gamePort: 7787, queryPort: 27025, rconPort: 27030 }),
    );
    const newer = repo.create(input({ name: "Alpha" }));
    db.prepare("UPDATE servers SET created_at = ? WHERE id = ?").run(
      "2020-01-01T00:00:00.000Z",
      older.id,
    );
    db.prepare("UPDATE servers SET created_at = ? WHERE id = ?").run(
      "2021-01-01T00:00:00.000Z",
      newer.id,
    );
    const ids = repo.list().map((p) => p.id);
    expect(ids).toEqual([older.id, newer.id]);
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
    expect(events[0]!.details).toBeNull();
  });

  it("persists structured event details", () => {
    repo.addEvent("srv-1", "update_failed", "error", "Update failed", {
      what: "SteamCMD job failed",
      cause: "exit 8",
      location: "C:/steamcmd",
      suggestion: "Retry after checking the log",
      context: { exitCode: 8 },
    });
    const events = repo.recentEvents(1);
    expect(events[0]!.details).toEqual({
      what: "SteamCMD job failed",
      cause: "exit 8",
      location: "C:/steamcmd",
      suggestion: "Retry after checking the log",
      context: { exitCode: 8 },
    });
  });

  it("promotes leftover Launch/extra WinLiveMaxPlayers into max_players", () => {
    const created = repo.create(input({ extraArgs: ["-NoBattlEye"], maxPlayers: 70 }));
    db.prepare(
      "UPDATE servers SET extra_args = ?, structured_launch_args = ? WHERE id = ?",
    ).run(
      JSON.stringify(["-NoBattlEye", "-WinLiveMaxPlayers=40"]),
      JSON.stringify({
        "winlivemaxplayers-integer": { enabled: true, value: "20" },
      }),
      created.id,
    );

    backfillMaxPlayersFromLegacyLaunchArgs(db);

    const next = repo.get(created.id);
    expect(next?.maxPlayers).toBe(40);
    expect(next?.extraArgs).toEqual(["-NoBattlEye"]);
    expect(next?.structuredLaunchArgs?.["winlivemaxplayers-integer"]).toBeUndefined();
  });

  it("promotes leftover WinLiveMaxPlayers=0 onto max_players (omit flag)", () => {
    const created = repo.create(input({ extraArgs: ["-NoBattlEye"], maxPlayers: 50 }));
    db.prepare("UPDATE servers SET extra_args = ? WHERE id = ?").run(
      JSON.stringify(["-NoBattlEye", "-WinLiveMaxPlayers=0"]),
      created.id,
    );

    backfillMaxPlayersFromLegacyLaunchArgs(db);

    const next = repo.get(created.id);
    expect(next?.maxPlayers).toBe(0);
    expect(next?.extraArgs).toEqual(["-NoBattlEye"]);
  });

  it("promotes uppercase leftover WinLiveMaxPlayers extra args", () => {
    const created = repo.create(input({ extraArgs: ["-NoBattlEye"], maxPlayers: 70 }));
    db.prepare("UPDATE servers SET extra_args = ? WHERE id = ?").run(
      JSON.stringify(["-NoBattlEye", "-WINLIVEMAXPLAYERS=40"]),
      created.id,
    );

    backfillMaxPlayersFromLegacyLaunchArgs(db);

    const next = repo.get(created.id);
    expect(next?.maxPlayers).toBe(40);
    expect(next?.extraArgs).toEqual(["-NoBattlEye"]);
  });

  it("fails closed when leftover Launch JSON is corrupt", () => {
    const created = repo.create(input({ extraArgs: ["-NoBattlEye"], maxPlayers: 70 }));
    db.prepare("UPDATE servers SET extra_args = ? WHERE id = ?").run(
      "[-WinLiveMaxPlayers=40",
      created.id,
    );

    expect(() => backfillMaxPlayersFromLegacyLaunchArgs(db)).toThrow(/invalid JSON/i);
  });
});
