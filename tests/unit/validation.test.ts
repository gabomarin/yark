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
    sessionName: "Mi Isla",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    ...overrides,
  };
}

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    ...validInput(),
    id: "id-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateProfileInput", () => {
  it("acepta un perfil válido", () => {
    expect(validateProfileInput(validInput())).toEqual([]);
  });

  it("rechaza puertos fuera de rango", () => {
    const issues = validateProfileInput(validInput({ gamePort: 80 }));
    expect(issues.some((i) => i.field === "gamePort")).toBe(true);
  });

  it("rechaza puertos internos duplicados", () => {
    const issues = validateProfileInput(
      validInput({ gamePort: 7777, queryPort: 7777 }),
    );
    expect(issues.some((i) => i.field === "ports")).toBe(true);
  });

  it("rechaza rutas no absolutas de Windows", () => {
    const issues = validateProfileInput(validInput({ installDir: "asa/island" }));
    expect(issues.some((i) => i.field === "installDir")).toBe(true);
  });

  it("acepta rutas UNC", () => {
    const issues = validateProfileInput(
      validInput({ installDir: "\\\\nas\\asa\\island" }),
    );
    expect(issues).toEqual([]);
  });

  it("exige clusterDir cuando hay clusterId", () => {
    const issues = validateProfileInput(
      validInput({ clusterId: "mi-cluster", clusterDir: null }),
    );
    expect(issues.some((i) => i.field === "clusterDir")).toBe(true);
  });

  it("rechaza mods duplicados", () => {
    const issues = validateProfileInput(validInput({ mods: ["1", "2", "1"] }));
    expect(issues.some((i) => i.field === "mods")).toBe(true);
  });

  it("rechaza nombres con caracteres incompatibles con carpetas Windows", () => {
    const issues = validateProfileInput(validInput({ name: "servidor:prod" }));
    expect(issues.some((i) => i.field === "name")).toBe(true);
  });

  it("rechaza nombres reservados de Windows", () => {
    const issues = validateProfileInput(validInput({ name: "CON" }));
    expect(issues.some((i) => i.field === "name" && /reservado/i.test(i.message))).toBe(
      true,
    );
  });

  it("rechaza segmentos de installDir incompatibles", () => {
    const issues = validateProfileInput(
      validInput({ installDir: "C:\\asa\\bad*folder" }),
    );
    expect(issues.some((i) => i.field === "installDir")).toBe(true);
  });
});

describe("findPortConflicts", () => {
  it("no reporta conflicto intra-perfil si un servidor reutiliza puerto entre kinds", () => {
    const a = profile({
      id: "a",
      name: "A",
      gamePort: 7777,
      queryPort: 7777,
      rconPort: 27020,
    });

    expect(findPortConflicts([a])).toEqual([]);
  });

  it("no reporta conflictos entre perfiles con puertos distintos", () => {
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

  it("detecta conflicto de puerto game entre dos perfiles", () => {
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

  it("detecta conflicto de un candidato nuevo contra existentes", () => {
    const a = profile({ id: "a", name: "A" });
    const conflicts = findPortConflicts([a], {
      name: "Nuevo",
      gamePort: 8888,
      queryPort: 27015,
      rconPort: 28020,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ port: 27015, kind: "query" });
  });

  it("no compara un perfil en edición contra sí mismo", () => {
    const a = profile({ id: "a", name: "A" });
    const conflicts = findPortConflicts(
      [a].filter((p) => p.id !== "a"),
      { id: "a", name: "A", gamePort: 7777, queryPort: 27015, rconPort: 27020 },
    );
    expect(conflicts).toEqual([]);
  });

  it("deduplica conflictos cuando el candidato reemplaza un perfil existente", () => {
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
