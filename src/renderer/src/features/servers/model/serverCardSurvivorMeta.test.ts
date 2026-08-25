import { describe, expect, it } from "vitest";
import {
  formatServerSurvivorMeta,
  resolveServerSurvivorCount,
} from "./serverCardSurvivorMeta";

describe("serverCardSurvivorMeta", () => {
  it("returns a count only for running servers with a successful list", () => {
    expect(
      resolveServerSurvivorCount({
        status: "running",
        survivorList: { players: [{ key: "1", name: "A" }], error: null, loading: false },
      }),
    ).toBe(1);
    expect(
      resolveServerSurvivorCount({
        status: "running",
        survivorList: { players: [], error: null, loading: false },
      }),
    ).toBe(0);
  });

  it("uses em dash when RCON failed or the server is not running (#301)", () => {
    expect(
      formatServerSurvivorMeta({
        status: "stopped",
        survivorList: { players: [{ key: "1", name: "A" }], error: null, loading: false },
        maxPlayers: 70,
      }),
    ).toBe("–");
    expect(
      formatServerSurvivorMeta({
        status: "running",
        survivorList: { players: [], error: "RCON down", loading: false },
        maxPlayers: 70,
      }),
    ).toBe("–");
    expect(
      formatServerSurvivorMeta({
        status: "running",
        survivorList: { players: [], error: null, loading: true },
        maxPlayers: 70,
      }),
    ).toBe("–");
    expect(
      formatServerSurvivorMeta({
        status: "running",
        survivorList: null,
        maxPlayers: 70,
      }),
    ).toBe("–");
  });

  it("formats running counts against max players", () => {
    expect(
      formatServerSurvivorMeta({
        status: "running",
        survivorList: {
          players: [{ key: "1", name: "A" }, { key: "2", name: "B" }],
          error: null,
          loading: false,
        },
        maxPlayers: 70,
      }),
    ).toBe("2/70");
  });
});
