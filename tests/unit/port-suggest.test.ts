import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_PORT,
  DEFAULT_QUERY_PORT,
  DEFAULT_RCON_PORT,
  PORT_SUGGEST_MAX_OFFSET,
  suggestNextPortTriplet,
} from "@shared/port-suggest";

function profile(
  id: string,
  ports: { gamePort: number; queryPort: number; rconPort: number },
) {
  return { id, name: id, ...ports };
}

describe("suggestNextPortTriplet", () => {
  it("returns factory defaults when the fleet is empty", () => {
    expect(suggestNextPortTriplet({ profiles: [] })).toEqual({
      gamePort: DEFAULT_GAME_PORT,
      queryPort: DEFAULT_QUERY_PORT,
      rconPort: DEFAULT_RCON_PORT,
      offset: 0,
    });
  });

  it("keeps defaults when they do not conflict", () => {
    expect(
      suggestNextPortTriplet({
        profiles: [
          profile("a", {
            gamePort: 7787,
            queryPort: 27025,
            rconPort: 27030,
          }),
        ],
      }),
    ).toMatchObject({
      gamePort: DEFAULT_GAME_PORT,
      queryPort: DEFAULT_QUERY_PORT,
      rconPort: DEFAULT_RCON_PORT,
      offset: 0,
    });
  });

  it("steps +10 while keeping relative spacing when defaults are taken", () => {
    expect(
      suggestNextPortTriplet({
        profiles: [
          profile("a", {
            gamePort: DEFAULT_GAME_PORT,
            queryPort: DEFAULT_QUERY_PORT,
            rconPort: DEFAULT_RCON_PORT,
          }),
        ],
      }),
    ).toEqual({
      gamePort: DEFAULT_GAME_PORT + 10,
      queryPort: DEFAULT_QUERY_PORT + 10,
      rconPort: DEFAULT_RCON_PORT + 10,
      offset: 10,
    });
  });

  it("skips a hole when only one port of the triplet conflicts", () => {
    expect(
      suggestNextPortTriplet({
        profiles: [
          profile("a", {
            gamePort: DEFAULT_GAME_PORT,
            queryPort: 28000,
            rconPort: 28001,
          }),
        ],
      }),
    ).toEqual({
      gamePort: DEFAULT_GAME_PORT + 10,
      queryPort: DEFAULT_QUERY_PORT + 10,
      rconPort: DEFAULT_RCON_PORT + 10,
      offset: 10,
    });
  });

  it("can start from custom bases (clone-style)", () => {
    expect(
      suggestNextPortTriplet({
        profiles: [
          profile("src", {
            gamePort: 8000,
            queryPort: 28000,
            rconPort: 28005,
          }),
        ],
        bases: { gamePort: 8000, queryPort: 28000, rconPort: 28005 },
      }),
    ).toEqual({
      gamePort: 8010,
      queryPort: 28010,
      rconPort: 28015,
      offset: 10,
    });
  });

  it("returns null when the bounded search is exhausted", () => {
    const profiles = [];
    for (let offset = 0; offset <= PORT_SUGGEST_MAX_OFFSET; offset += 10) {
      profiles.push(
        profile(`p${offset}`, {
          gamePort: DEFAULT_GAME_PORT + offset,
          queryPort: DEFAULT_QUERY_PORT + offset,
          rconPort: DEFAULT_RCON_PORT + offset,
        }),
      );
    }
    expect(suggestNextPortTriplet({ profiles })).toBeNull();
  });
});
