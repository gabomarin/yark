import { describe, expect, it } from "vitest";
import { applyIniSemanticOps, buildIniSemanticOps } from "@shared/ini/ini-semantic-ops";
import {
  listPlayerLevelEngramPoints,
  sectionForNewPlayerLevelEngramPoints,
} from "@shared/ini/player-level-engram-points";
import type { ServerIniPayload } from "@shared/types";

const SECTION = "[/Script/ShooterGame.ShooterGameMode]";

function game(body: string): ServerIniPayload {
  return { gameUserSettings: "", game: body.endsWith("\n") ? body : `${body}\n` };
}

describe("player level engram points", () => {
  it("numbers lines in file order and skips other keys", () => {
    const text = `${SECTION}
OverridePlayerLevelEngramPoints=8
OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C")
OverridePlayerLevelEngramPoints=12
`;
    expect(listPlayerLevelEngramPoints(text)).toEqual([
      { section: "/Script/ShooterGame.ShooterGameMode", occurrence: 0, level: 1, points: "8" },
      { section: "/Script/ShooterGame.ShooterGameMode", occurrence: 1, level: 2, points: "12" },
    ]);
    expect(sectionForNewPlayerLevelEngramPoints(text)).toBe("/Script/ShooterGame.ShooterGameMode");
    expect(sectionForNewPlayerLevelEngramPoints(`${SECTION}\n`)).toBe("/Script/ShooterGame.ShooterGameMode");
    expect(sectionForNewPlayerLevelEngramPoints("")).toBe("/Script/ShooterGame.ShooterGameMode");
  });

  it("ignores the key outside ShooterGameMode", () => {
    const text = `[CustomGameMode]
OverridePlayerLevelEngramPoints=4
${SECTION}
OverridePlayerLevelEngramPoints=8
`;
    expect(listPlayerLevelEngramPoints(text)).toEqual([
      { section: "/Script/ShooterGame.ShooterGameMode", occurrence: 0, level: 1, points: "8" },
    ]);
  });

  it("saves a changed level and an added level without rewriting the engram line", () => {
    const engram = 'OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=False)';
    const baseline = game(`${SECTION}\nOverridePlayerLevelEngramPoints=8\n${engram}\n`);
    const draft = game(
      `${SECTION}\nOverridePlayerLevelEngramPoints=10\n${engram}\nOverridePlayerLevelEngramPoints=0\n`,
    );
    const ops = buildIniSemanticOps(baseline, draft);
    expect(ops).toEqual([
      {
        kind: "set",
        fileKey: "game",
        section: "/Script/ShooterGame.ShooterGameMode",
        key: "OverridePlayerLevelEngramPoints",
        occurrence: 0,
        expectedPreviousValue: "8",
        nextValue: "10",
      },
      {
        kind: "set",
        fileKey: "game",
        section: "/Script/ShooterGame.ShooterGameMode",
        key: "OverridePlayerLevelEngramPoints",
        occurrence: 1,
        expectedPreviousValue: null,
        nextValue: "0",
      },
    ]);
    const next = applyIniSemanticOps(baseline, ops);
    expect(next.game).toContain(`${engram}\n`);
    expect(next.game).toContain("OverridePlayerLevelEngramPoints=10\n");
    expect(next.game).toContain("OverridePlayerLevelEngramPoints=0\n");
  });
});
