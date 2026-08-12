import { describe, expect, it } from "vitest";
import {
  formatPlayerSessionNotes,
  parsePlayerKeyFromNotes,
  parsePlayerNameFromNotes,
  playerBackupDisplayName,
  playersRetentionKey,
} from "@shared/backup-player-meta";
import type { BackupRecord } from "@shared/types";

function backup(partial: Partial<BackupRecord> & Pick<BackupRecord, "notes" | "type">): BackupRecord {
  return {
    id: "bk-1",
    serverId: "srv-1",
    kind: "players",
    path: "C:/backups/players/Alice",
    sizeBytes: 1,
    status: "completed",
    createdAt: "2026-07-24T12:00:00.000Z",
    completedAt: "2026-07-24T12:00:01.000Z",
    mapToken: null,
    ...partial,
  };
}

describe("backup-player-meta", () => {
  it("stores playerName tag in session notes", () => {
    const notes = formatPlayerSessionNotes("connect", "76561198000000000", "Alice");
    expect(notes).toContain("[playerKey=76561198000000000]");
    expect(notes).toContain("[playerName=Alice]");
    expect(parsePlayerNameFromNotes(notes)).toBe("Alice");
    expect(parsePlayerKeyFromNotes(notes)).toBe("76561198000000000");
  });

  it("parses legacy notes without playerName tag", () => {
    const legacy =
      "[playerKey=76561198000000000] Player disconnected: Bob (76561198000000000)";
    expect(parsePlayerNameFromNotes(legacy)).toBe("Bob");
    expect(playersRetentionKey(backup({ notes: legacy, type: "player_disconnect" }))).toBe(
      "76561198000000000",
    );
  });

  it("falls back to key, All players, or path stem", () => {
    expect(
      playerBackupDisplayName(
        backup({
          notes: "[playerKey=abc] Player connected: (abc)",
          type: "player_connect",
        }),
      ),
    ).toBe("abc");
    expect(
      playerBackupDisplayName(
        backup({ notes: null, type: "manual", path: "C:/backups/full-players" }),
      ),
    ).toBe("All players");
    expect(
      playerBackupDisplayName(
        backup({
          notes: null,
          type: "player_connect",
          path: "C:/backups/orphan-session",
        }),
      ),
    ).toBe("orphan-session");
  });
});
