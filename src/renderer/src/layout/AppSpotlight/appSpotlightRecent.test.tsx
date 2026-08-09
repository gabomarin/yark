import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeSpotlightRecent,
  pushSpotlightRecent,
  readSpotlightRecent,
  resetSpotlightRecentCacheForTests,
  SPOTLIGHT_RECENT_STORAGE_KEY,
  writeSpotlightRecent,
} from "./appSpotlightRecent";

afterEach(() => {
  window.localStorage.removeItem(SPOTLIGHT_RECENT_STORAGE_KEY);
  resetSpotlightRecentCacheForTests();
});

describe("normalizeSpotlightRecent", () => {
  it("keeps MRU order, dedupes, and drops junk", () => {
    expect(
      normalizeSpotlightRecent([
        { kind: "server", serverId: "a" },
        { kind: "nav", route: "settings" },
        { kind: "server", serverId: "a" },
        { kind: "nav", route: "nope" },
        { kind: "server", serverId: "b" },
        null,
      ]),
    ).toEqual([
      { kind: "server", serverId: "a" },
      { kind: "nav", route: "settings" },
      { kind: "server", serverId: "b" },
    ]);
  });
});

describe("pushSpotlightRecent", () => {
  it("persists and moves an existing entry to the front", () => {
    writeSpotlightRecent([
      { kind: "nav", route: "logs" },
      { kind: "server", serverId: "srv-1" },
    ]);

    const next = pushSpotlightRecent({ kind: "server", serverId: "srv-1" });
    expect(next).toEqual([
      { kind: "server", serverId: "srv-1" },
      { kind: "nav", route: "logs" },
    ]);
    expect(readSpotlightRecent()).toEqual(next);
  });
});
