import { beforeEach, describe, expect, it, vi } from "vitest";
import { offsetPort, type ServerProfile } from "@shared/types";
import * as portSuggest from "@shared/port-suggest";
import { cloneDialogFormState, isValidClonePort } from "./cloneServerDialogModel";

vi.mock("@shared/port-suggest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/port-suggest")>();
  return {
    ...actual,
    suggestNextPortTriplet: vi.fn(actual.suggestNextPortTriplet),
  };
});

const mockedSuggest = vi.mocked(portSuggest.suggestNextPortTriplet);
const realSuggest = (
  await vi.importActual<typeof import("@shared/port-suggest")>("@shared/port-suggest")
).suggestNextPortTriplet;

function profile(partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">): ServerProfile {
  return {
    map: "TheIsland_WP",
    installDir: `C:\\ARK\\${partial.name}`,
    enabled: true,
    autoStart: false,
    sessionName: `${partial.name} Session`,
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("isValidClonePort", () => {
  it("accepts inclusive legal bounds and rejects outside / non-integers", () => {
    expect(isValidClonePort("1023")).toBe(false);
    expect(isValidClonePort("1024")).toBe(true);
    expect(isValidClonePort("65535")).toBe(true);
    expect(isValidClonePort("65536")).toBe(false);
    expect(isValidClonePort("7777.5")).toBe(false);
    expect(isValidClonePort("abc")).toBe(false);
    expect(isValidClonePort("")).toBe(false);
  });
});

describe("cloneDialogFormState", () => {
  beforeEach(() => {
    mockedSuggest.mockImplementation(realSuggest);
  });

  it("returns empty defaults when source is null", () => {
    expect(cloneDialogFormState(null)).toEqual({
      name: "",
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      installDir: "",
      copyInstallFolder: false,
    });
    expect(mockedSuggest).not.toHaveBeenCalled();
  });

  it("starts at source+10 when the fleet is empty", () => {
    const source = profile({ id: "src", name: "Island" });
    const state = cloneDialogFormState(source, []);
    expect(state.name).toBe("Island-copy");
    expect(state.sessionName).toBe("Island Session-copy");
    expect(state.gamePort).toBe("7787");
    expect(state.queryPort).toBe("27025");
    expect(state.rconPort).toBe("27030");
    expect(mockedSuggest).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: [],
        bases: { gamePort: 7787, queryPort: 27025, rconPort: 27030 },
        candidateName: "Island-copy",
      }),
    );
  });

  it("skips the source triplet when the source is in the fleet", () => {
    const source = profile({ id: "src", name: "Island" });
    const state = cloneDialogFormState(source, [source]);
    expect(state.gamePort).toBe("7787");
    expect(state.queryPort).toBe("27025");
    expect(state.rconPort).toBe("27030");
  });

  it("picks a non-conflicting triplet when source+10 is taken", () => {
    const source = profile({ id: "src", name: "Island" });
    const taken = profile({
      id: "other",
      name: "Other",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    });
    const state = cloneDialogFormState(source, [source, taken]);
    expect(state.gamePort).toBe("7797");
    expect(state.queryPort).toBe("27035");
    expect(state.rconPort).toBe("27040");
  });

  it("falls back to wrapped source+10 when suggestion returns null", () => {
    mockedSuggest.mockReturnValue(null);
    const source = profile({
      id: "src",
      name: "Island",
      gamePort: 65530,
      queryPort: 65531,
      rconPort: 65532,
    });
    const state = cloneDialogFormState(source, [source]);
    expect(state.gamePort).toBe(String(offsetPort(65530, 10)));
    expect(state.queryPort).toBe(String(offsetPort(65531, 10)));
    expect(state.rconPort).toBe(String(offsetPort(65532, 10)));
    expect(isValidClonePort(state.gamePort)).toBe(true);
  });

  it("wraps empty-fleet bases near PORT_MAX via offsetPort", () => {
    const source = profile({
      id: "src",
      name: "Island",
      gamePort: 65530,
      queryPort: 65531,
      rconPort: 65532,
    });
    const state = cloneDialogFormState(source, []);
    expect(Number(state.gamePort)).toBe(offsetPort(65530, 10));
    expect(Number(state.gamePort)).toBeLessThanOrEqual(65535);
  });
});
