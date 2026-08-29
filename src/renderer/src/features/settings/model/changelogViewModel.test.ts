import { describe, expect, it } from "vitest";
import type { ChangelogEntry } from "@shared/changelog";
import {
  changelogNoteCount,
  changelogNoteCountLabel,
  formatChangelogDate,
} from "./changelogViewModel";

describe("changelogViewModel", () => {
  it("formats ISO dates as day Mon year without UTC shift", () => {
    expect(formatChangelogDate("2026-08-29")).toBe("29 Aug 2026");
    expect(formatChangelogDate("not-a-date")).toBe("not-a-date");
  });

  it("counts notes and pluralizes", () => {
    const entry: ChangelogEntry = {
      version: "0.1.0",
      date: "2026-08-01",
      sections: [
        { title: "Added", items: ["One."] },
        { title: "Fixed", items: ["Two.", "Three."] },
      ],
    };
    expect(changelogNoteCount(entry)).toBe(3);
    expect(changelogNoteCountLabel(1)).toBe("1 note");
    expect(changelogNoteCountLabel(3)).toBe("3 notes");
  });
});
