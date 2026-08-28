import { describe, expect, it } from "vitest";
import { parseOptionalMaxPlayers, resolveCreatePortFields } from "@features/servers/components/ServerForm/serverFormModel";
import {
  DEFAULT_GAME_PORT,
  DEFAULT_QUERY_PORT,
  DEFAULT_RCON_PORT,
} from "@shared/port-suggest";

describe("parseOptionalMaxPlayers", () => {
  it("treats empty, blank, and non-numeric input as 0 (omit -WinLiveMaxPlayers)", () => {
    expect(parseOptionalMaxPlayers("")).toBe(0);
    expect(parseOptionalMaxPlayers(" ")).toBe(0);
    expect(parseOptionalMaxPlayers("abc")).toBe(0);
  });

  it("parses a slot count", () => {
    expect(parseOptionalMaxPlayers("70")).toBe(70);
    expect(parseOptionalMaxPlayers(" 9 ")).toBe(9);
  });
});

describe("resolveCreatePortFields", () => {
  it("uses factory defaults on an empty fleet", () => {
    expect(resolveCreatePortFields([])).toEqual({
      gamePort: String(DEFAULT_GAME_PORT),
      queryPort: String(DEFAULT_QUERY_PORT),
      rconPort: String(DEFAULT_RCON_PORT),
      suggestion: { offset: 0, exhausted: false },
    });
  });

  it("suggests the next triplet when defaults are taken", () => {
    expect(
      resolveCreatePortFields([
        {
          id: "a",
          name: "A",
          gamePort: DEFAULT_GAME_PORT,
          queryPort: DEFAULT_QUERY_PORT,
          rconPort: DEFAULT_RCON_PORT,
        },
      ]),
    ).toEqual({
      gamePort: String(DEFAULT_GAME_PORT + 10),
      queryPort: String(DEFAULT_QUERY_PORT + 10),
      rconPort: String(DEFAULT_RCON_PORT + 10),
      suggestion: { offset: 10, exhausted: false },
    });
  });
});
