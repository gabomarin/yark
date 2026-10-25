import { describe, expect, it } from "vitest";
import { namedEngramEditsSchema } from "@shared/ipc/primitives";

const append = {
  kind: "append" as const,
  className: "EngramEntry_Campfire_C",
  hidden: null,
  points: "3",
  level: null,
  removePrereq: null,
};

describe("namedEngramEditsSchema", () => {
  it("accepts a class with no spaces", () => {
    expect(namedEngramEditsSchema.safeParse([append]).success).toBe(true);
  });

  it("rejects a class that contains whitespace", () => {
    expect(namedEngramEditsSchema.safeParse([{ ...append, className: "Engram Entry" }]).success).toBe(false);
    expect(namedEngramEditsSchema.safeParse([{ ...append, className: " EngramEntry_Campfire_C" }]).success).toBe(false);
  });

  it("rejects an edit list over the shared character budget", () => {
    const raw = "x".repeat(100_000);
    const edits = Array.from({ length: 41 }, () => ({
      kind: "delete" as const,
      section: "ShooterGameMode",
      occurrence: 0,
      expectedRaw: raw,
      className: "EngramEntry_Campfire_C",
    }));
    expect(namedEngramEditsSchema.safeParse(edits).success).toBe(false);
  });
});
