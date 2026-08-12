import { describe, expect, it } from "vitest";
import {
  getChangelogForVersion,
  getRecentChangelog,
  shouldShowWhatsNewForVersion,
  type ChangelogEntry,
} from "@shared/changelog";

const sample: ChangelogEntry[] = [
  {
    version: "0.12.0",
    date: "2026-09-01",
    sections: [{ title: "Added", items: ["Newer"] }],
  },
  {
    version: "0.11.0",
    date: "2026-08-12",
    sections: [{ title: "Fixed", items: ["Older"] }],
  },
];

describe("changelog helpers", () => {
  it("finds an entry by version with optional v prefix", () => {
    expect(getChangelogForVersion("0.11.0", sample)?.version).toBe("0.11.0");
    expect(getChangelogForVersion("v0.12.0", sample)?.version).toBe("0.12.0");
    expect(getChangelogForVersion("9.9.9", sample)).toBeNull();
  });

  it("returns a newest-first recent slice", () => {
    expect(getRecentChangelog(1, sample).map((e) => e.version)).toEqual(["0.12.0"]);
    expect(getRecentChangelog(0, sample)).toEqual([]);
  });

  it("shows What's new only when the installed version changed and has notes", () => {
    expect(shouldShowWhatsNewForVersion("0.12.0", null, sample)).toBe(true);
    expect(shouldShowWhatsNewForVersion("0.12.0", "0.11.0", sample)).toBe(true);
    expect(shouldShowWhatsNewForVersion("0.12.0", "v0.12.0", sample)).toBe(false);
    expect(shouldShowWhatsNewForVersion("9.9.9", null, sample)).toBe(false);
  });
});
