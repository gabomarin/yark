import { describe, expect, it } from "vitest";
import type { IniConflictOccurrence } from "@shared/ini/ini-conflict";
import { conflictRowKey } from "./iniConflictReviewModel";

function row(section: string, key: string): IniConflictOccurrence {
  return {
    kind: "scalar",
    fileKey: "game",
    section,
    key,
    occurrence: 0,
    loaded: null,
    local: null,
    disk: null,
  };
}

describe("conflictRowKey", () => {
  it("keeps a dotted section distinct from a dotted key", () => {
    expect(conflictRowKey(row("a.b", "c"))).not.toBe(conflictRowKey(row("a", "b.c")));
  });
});
