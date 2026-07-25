import { afterEach, describe, expect, it } from "vitest";
import { parseListPlayersResponse } from "@backend/domains/backups/list-players";

describe("parseListPlayersResponse", () => {
  afterEach(() => {
    // no-op
  });

  it("returns empty for no players", () => {
    expect(parseListPlayersResponse("No Players Connected")).toEqual([]);
    expect(parseListPlayersResponse("")).toEqual([]);
  });

  it("parses steam-style ListPlayers lines", () => {
    const players = parseListPlayersResponse(
      "0. Alice, 76561198000000000\n1. Bob, 76561198000000001\n",
    );
    expect(players).toEqual([
      { key: "76561198000000000", name: "Alice" },
      { key: "76561198000000001", name: "Bob" },
    ]);
  });

  it("parses EOS / UniqueNetId lines", () => {
    const players = parseListPlayersResponse(
      "0. Carol, UniqueNetId:0002abcdef0123456789\n",
    );
    expect(players).toEqual([
      { key: "0002abcdef0123456789", name: "Carol" },
    ]);
  });
});
