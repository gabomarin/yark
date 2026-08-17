import { describe, expect, it } from "vitest";
import {
  findPortConflicts,
  validateProfileInput,
} from "@backend/domains/instances/validation";
import type { ServerProfile, ServerProfileInput } from "@shared/types";

function validInput(overrides: Partial<ServerProfileInput> = {}): ServerProfileInput {
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
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    autoStart: false,
    ...overrides,
  };
}

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    ...validInput(),
    id: "id-1",
    enabled: true,
    autoStart: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateProfileInput", () => {
  it("accepts a valid profile", () => {
    expect(validateProfileInput(validInput())).toEqual([]);
  });

  it("rejects enabled structured options that need a value (#93)", () => {
    const issues = validateProfileInput(
      validInput({
        structuredLaunchArgs: {
          usedynamicconfig: { enabled: true },
          "customdynamicconfigurl-url": { enabled: true, value: "   " },
        },
      }),
    );
    expect(issues.some((i) => /requires a value/i.test(i.message))).toBe(true);
    expect(
      issues.some((i) => i.field === "structuredLaunchArgs"),
    ).toBe(true);
  });

  it("rejects raw args that duplicate structured selections (#93)", () => {
    const issues = validateProfileInput(
      validInput({
        structuredLaunchArgs: { nobattleye: { enabled: true } },
        extraArgs: ["-NoBattlEye"],
      }),
    );
    expect(issues.some((i) => /duplicates a structured/i.test(i.message))).toBe(
      true,
    );
    expect(issues.some((i) => i.field === "extraArgs")).toBe(true);
  });

  it("rejects custom maps on create but allows them on edit (#292)", () => {
    const custom = validInput({ map: "Svartalfheim_WP", mapModId: "962796" });
    expect(
      validateProfileInput(custom, { create: true }).some((i) => i.field === "map"),
    ).toBe(true);
    expect(
      validateProfileInput(custom, { create: true }).some(
        (i) => i.field === "mapModId",
      ),
    ).toBe(true);
    expect(validateProfileInput(custom)).toEqual([]);
    expect(validateProfileInput(validInput(), { create: true })).toEqual([]);
  });

  it("rejects invalid mapModId digits but not missing map-mod warnings (#190)", () => {
    const invalid = validateProfileInput(
      validInput({
        map: "Svartalfheim_WP",
        mapModId: "0abc",
        mods: ["962796"],
      }),
    );
    expect(invalid.some((i) => i.field === "mapModId")).toBe(true);

    const missingMod = validateProfileInput(
      validInput({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: [],
      }),
    );
    // Soft inconsistency warnings are reserved for Launch/start (#194).
    expect(missingMod).toEqual([]);
  });

  it("rejects ports out of range", () => {
    const issues = validateProfileInput(validInput({ gamePort: 80 }));
    expect(issues.some((i) => i.field === "gamePort")).toBe(true);
  });

  it("accepts maxPlayers at the 1–255 bounds and rejects outside", () => {
    expect(validateProfileInput(validInput({ maxPlayers: 1 }))).toEqual([]);
    expect(validateProfileInput(validInput({ maxPlayers: 255 }))).toEqual([]);
    expect(
      validateProfileInput(validInput({ maxPlayers: 0 })).some((i) => i.field === "maxPlayers"),
    ).toBe(true);
    expect(
      validateProfileInput(validInput({ maxPlayers: 256 })).some((i) => i.field === "maxPlayers"),
    ).toBe(true);
  });

  it("rejects duplicated internal ports", () => {
    const issues = validateProfileInput(
      validInput({ gamePort: 7777, queryPort: 7777 }),
    );
    expect(issues.some((i) => i.field === "ports")).toBe(true);
  });

  it("rejects non-absolute Windows paths", () => {
    const issues = validateProfileInput(validInput({ installDir: "asa/island" }));
    expect(issues.some((i) => i.field === "installDir")).toBe(true);
  });

  it("accepts UNC paths", () => {
    const issues = validateProfileInput(
      validInput({ installDir: "\\\\nas\\asa\\island" }),
    );
    expect(issues).toEqual([]);
  });

  it("requires clusterDir when clusterId is set", () => {
    const issues = validateProfileInput(
      validInput({ clusterId: "my-cluster", clusterDir: null }),
    );
    expect(issues.some((i) => i.field === "clusterDir")).toBe(true);
  });

  it("rejects duplicate mods", () => {
    const issues = validateProfileInput(validInput({ mods: ["1", "2", "1"] }));
    expect(issues.some((i) => i.field === "mods")).toBe(true);
  });

  it("rejects names with characters incompatible with Windows folders", () => {
    const issues = validateProfileInput(validInput({ name: "server:prod" }));
    expect(issues.some((i) => i.field === "name")).toBe(true);
  });

  it("rejects reserved Windows names", () => {
    const issues = validateProfileInput(validInput({ name: "CON" }));
    expect(issues.some((i) => i.field === "name" && /reserved/i.test(i.message))).toBe(
      true,
    );
  });

  it("rejects incompatible installDir segments", () => {
    const issues = validateProfileInput(
      validInput({ installDir: "C:\\asa\\bad*folder" }),
    );
    expect(issues.some((i) => i.field === "installDir")).toBe(true);
  });
});

describe("findPortConflicts", () => {
  it("does not report an intra-profile conflict when a server reuses a port across kinds", () => {
    const a = profile({
      id: "a",
      name: "A",
      gamePort: 7777,
      queryPort: 7777,
      rconPort: 27020,
    });

    expect(findPortConflicts([a])).toEqual([]);
  });

  it("does not report conflicts between profiles with different ports", () => {
    const a = profile({ id: "a", name: "A" });
    const b = profile({
      id: "b",
      name: "B",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    });
    expect(findPortConflicts([a, b])).toEqual([]);
  });

  it("detects a game port conflict between two profiles", () => {
    const a = profile({ id: "a", name: "A" });
    const b = profile({
      id: "b",
      name: "B",
      queryPort: 27025,
      rconPort: 27030,
    });
    const conflicts = findPortConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ port: 7777, kind: "game" });
  });

  it("detects a conflict of a new candidate against existing profiles", () => {
    const a = profile({ id: "a", name: "A" });
    const conflicts = findPortConflicts([a], {
      name: "New",
      gamePort: 8888,
      queryPort: 27015,
      rconPort: 28020,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ port: 27015, kind: "query" });
  });

  it("does not compare an in-edit profile against itself", () => {
    const a = profile({ id: "a", name: "A" });
    const conflicts = findPortConflicts(
      [a].filter((p) => p.id !== "a"),
      { id: "a", name: "A", gamePort: 7777, queryPort: 27015, rconPort: 27020 },
    );
    expect(conflicts).toEqual([]);
  });

  it("deduplicates conflicts when the candidate replaces an existing profile", () => {
    const a = profile({ id: "a", name: "A", gamePort: 7777, queryPort: 27015, rconPort: 27020 });
    const b = profile({
      id: "b",
      name: "B",
      gamePort: 8888,
      queryPort: 27015,
      rconPort: 28020,
    });

    const conflicts = findPortConflicts([a, b], {
      id: "a",
      name: "A",
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      port: 27015,
      serverA: "A",
      serverB: "B",
    });
  });
});
