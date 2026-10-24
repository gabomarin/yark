import { describe, expect, it } from "vitest";
import {
  applyNamedEngramEdits,
  draftForNewEngram,
  draftFromRow,
  NamedEngramEditError,
  reviewNamedEngramDraft,
  reviewNamedEngramState,
  summarizeNamedEngrams,
} from "@shared/ini/engram-named-entries";

const SECTION = "[/Script/ShooterGame.ShooterGameMode]";

function game(lines: string[]): string {
  return `${SECTION}\n${lines.join("\n")}\n`;
}

describe("summarizeNamedEngrams", () => {
  it("reads the wiki fields and leaves index lines, extra fields, and broken lines as written", () => {
    const text = game([
      "bAutoUnlockAllEngrams=True",
      "bOnlyAllowSpecifiedEngrams=False",
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=False,EngramPointsCost=3,EngramLevelRequirement=2,RemoveEngramPreReq=True)',
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_StoneHatchet_C",EngramHidden=False,EngramPointsCost=3,EngramLevelRequirement=3, RemoveEngramPreReq=True)',
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=True)',
      "OverrideNamedEngramEntries=(EngramIndex=0,EngramHidden=False)",
      "OverrideEngramEntries=(EngramIndex=0,EngramHidden=False)",
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Torch_C",Extra=1)',
      "OverrideNamedEngramEntries=not-a-tuple",
    ]);

    const summary = summarizeNamedEngrams(text);

    expect(summary.autoUnlockAll).toBe(true);
    expect(summary.onlySpecified).toBe(false);
    expect(summary.rows.map((row) => row.className)).toEqual([
      "EngramEntry_Campfire_C",
      "EngramEntry_StoneHatchet_C",
      "EngramEntry_Campfire_C",
    ]);
    expect(summary.rows[0]).toMatchObject({
      hidden: false,
      points: "3",
      level: "2",
      removePrereq: true,
      duplicate: true,
    });
    expect(summary.rows[1]).toMatchObject({ hidden: false, points: "3", level: "3", removePrereq: true });
    expect(summary.rows[2]?.duplicate).toBe(true);
    expect(summary.leftoverCount).toBe(4);
    expect(summary.rows).toHaveLength(3);
  });

  it("reports an empty named list when the game is using its own levels and costs", () => {
    const summary = summarizeNamedEngrams(`${SECTION}\nbAutoUnlockAllEngrams=False\n`);
    expect(summary.rows).toEqual([]);
    expect(summary.leftoverCount).toBe(0);
    expect(summary.autoUnlockAll).toBe(false);
  });
});

describe("applyNamedEngramEdits", () => {
  const hatchet = 'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_StoneHatchet_C",EngramHidden=False)';

  it("reprints only the changed named line and keeps CRLF neighbors", () => {
    const text =
      `${SECTION}\r\n` +
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C", EngramHidden=False, EngramPointsCost=3)\r\n' +
      `${hatchet}\r\n` +
      "; keep\r\n";
    const row = summarizeNamedEngrams(text).rows[0]!;
    const draft = { ...draftFromRow(row), hidden: true };
    const review = reviewNamedEngramDraft(row, draft);
    expect(review.ok).toBe(true);
    if (!review.ok || review.edit === null) throw new Error("expected a replace");

    const next = applyNamedEngramEdits(text, [review.edit]);

    expect(next).toContain(
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=true,EngramPointsCost=3)\r\n',
    );
    expect(next).toContain(`${hatchet}\r\n`);
    expect(next).toContain("; keep\r\n");
    expect(next).not.toContain("EngramHidden=False, EngramPointsCost");
  });

  it("returns the same string when there is nothing to write", () => {
    const text = game([hatchet]);
    expect(applyNamedEngramEdits(text, [])).toBe(text);
    const row = summarizeNamedEngrams(text).rows[0]!;
    expect(reviewNamedEngramDraft(row, draftFromRow(row))).toEqual({ ok: true, edit: null });
  });

  it("deletes one line and leaves the next line as written", () => {
    const text = game([
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=False)',
      hatchet,
    ]);
    const row = summarizeNamedEngrams(text).rows[0]!;
    const next = applyNamedEngramEdits(text, [
      {
        kind: "delete",
        section: row.section,
        occurrence: row.occurrence,
        expectedRaw: row.expectedRaw,
        className: row.className,
      },
    ]);
    expect(next).not.toContain("Campfire");
    expect(next).toContain(hatchet);
  });

  it("refuses the write when the line changed after load", () => {
    const text = game([hatchet]);
    const row = summarizeNamedEngrams(text).rows[0]!;
    expect(() =>
      applyNamedEngramEdits(text, [
        {
          kind: "replace",
          section: row.section,
          occurrence: row.occurrence,
          expectedRaw: '(EngramClassName="EngramEntry_Other_C")',
          className: row.className,
          hidden: true,
          points: null,
          level: null,
          removePrereq: null,
        },
      ]),
    ).toThrow(NamedEngramEditError);
    expect(applyNamedEngramEdits(text, [])).toBe(text);
  });

  it("appends one official line and leaves the neighbor as written", () => {
    const text = `${SECTION}\r\n${hatchet}\r\n; keep\r\n`;
    const next = applyNamedEngramEdits(text, [
      {
        kind: "append",
        className: "EngramEntry_Campfire_C",
        hidden: null,
        points: "6",
        level: null,
        removePrereq: null,
      },
    ]);

    expect(next).toContain(`${hatchet}\r\n`);
    expect(next).toContain("; keep\r\n");
    expect(next).toContain(
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramPointsCost=6)\r\n',
    );
    expect(next.match(/\[\/Script\/ShooterGame\.ShooterGameMode\]/g)).toHaveLength(1);
  });

  it("creates ShooterGameMode when the file has no section", () => {
    const next = applyNamedEngramEdits("bOnlyAllowSpecifiedEngrams=False\n", [
      {
        kind: "append",
        className: "EngramEntry_Torch_C",
        hidden: true,
        points: null,
        level: null,
        removePrereq: null,
      },
    ]);

    expect(next).toContain("[/Script/ShooterGame.ShooterGameMode]");
    expect(next).toContain('OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Torch_C",EngramHidden=true)');
    expect(next).toContain("bOnlyAllowSpecifiedEngrams=False");
  });
});

describe("reviewNamedEngramState appends", () => {
  it("blocks a new line that only has a class", () => {
    const review = reviewNamedEngramState([], {}, [
      {
        id: "1",
        originClass: "EngramEntry_Torch_C",
        draft: draftForNewEngram("EngramEntry_Torch_C"),
        listEngram: false,
      },
    ]);

    expect(review.edits).toEqual([]);
    expect(review.blocked).toBe(true);
  });

  it("does not add Hidden on a new line that only names a class", () => {
    const review = reviewNamedEngramState([], {}, [
      {
        id: "1",
        originClass: "EngramEntry_Torch_C",
        draft: draftForNewEngram("EngramEntry_Torch_C"),
        listEngram: true,
      },
    ]);

    expect(review.edits).toEqual([]);
    expect(review.blocked).toBe(true);
  });

  it("blocks a new line whose class name contains a space", () => {
    const review = reviewNamedEngramState([], {}, [
      {
        id: "1",
        originClass: "Engram Entry",
        draft: { ...draftForNewEngram("Engram Entry"), points: "3" },
        listEngram: false,
      },
    ]);

    expect(review.edits).toEqual([]);
    expect(review.blocked).toBe(true);
  });

  it("blocks a saved line that was cleared back to an empty cost and Hidden off", () => {
    const text = game([
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramPointsCost=3,EngramLevelRequirement=2)',
    ]);
    const row = summarizeNamedEngrams(text).rows[0]!;
    const review = reviewNamedEngramDraft(row, { ...draftFromRow(row), points: "", level: "" });

    expect(review).toEqual({
      ok: false,
      reason: "Set a cost, a level, hide it, or remove its prerequisite. A class alone does not change the game.",
    });
  });

  it("keeps a cleared line as visible when only listed engrams are allowed", () => {
    const text = game([
      "bOnlyAllowSpecifiedEngrams=True",
      'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramPointsCost=3)',
    ]);
    const row = summarizeNamedEngrams(text).rows[0]!;
    const review = reviewNamedEngramDraft(row, { ...draftFromRow(row), points: "" }, true);

    expect(review.ok).toBe(true);
    if (!review.ok || review.edit === null || review.edit.kind !== "replace") {
      throw new Error("expected a replace");
    }
    expect(review.edit.hidden).toBe(false);
    expect(review.edit.points).toBeNull();
  });
});
