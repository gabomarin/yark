import { describe, expect, it } from "vitest";
import { stageUnverifiedProjectIds } from "./unverifiedModAdd";

describe("stageUnverifiedProjectIds (#698)", () => {
  it("appends new IDs disabled without touching the metadata cache", () => {
    const next = stageUnverifiedProjectIds(
      {
        configuredIds: ["947033"],
        disabledIds: [],
        cache: { "947033": { id: "947033", name: "Cached" } as never },
      },
      ["932759"],
    );
    expect(next.configuredIds).toEqual(["947033", "932759"]);
    expect(next.disabledIds).toEqual(["932759"]);
    expect(next.cache).toEqual({ "947033": { id: "947033", name: "Cached" } });
  });

  it("does not duplicate an ID that is already configured", () => {
    const next = stageUnverifiedProjectIds({ configuredIds: ["932759"], disabledIds: ["932759"], cache: {} }, [
      "932759",
    ]);
    expect(next.configuredIds).toEqual(["932759"]);
    expect(next.disabledIds).toEqual(["932759"]);
  });
});
