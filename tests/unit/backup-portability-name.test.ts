import { describe, expect, it } from "vitest";
import { formatBackupFileStamp } from "@shared/backup-file-stamp";
import {
  slugFilePart,
  suggestedExportFileName,
} from "../../src/renderer/src/features/backups/backupPortability";
import type { BackupRecord } from "@shared/types";

function makeBackup(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id: "bak-1",
    serverId: "srv-1",
    type: "manual",
    kind: "world",
    path: "C:/Backups/World/a.zip",
    sizeBytes: 10,
    status: "completed",
    createdAt: "2026-01-02T03:04:05.678Z",
    completedAt: "2026-01-02T03:04:05.678Z",
    notes: null,
    ...overrides,
  };
}

describe("formatBackupFileStamp", () => {
  it("formats a compact local YYYYMMDD-HHmmss stamp", () => {
    expect(formatBackupFileStamp("2026-01-02T15:04:05.678Z")).toMatch(
      /^\d{8}-\d{6}$/,
    );
  });
});

describe("suggestedExportFileName", () => {
  it("puts the compact date stamp at the end before .zip", () => {
    const name = suggestedExportFileName(makeBackup(), "My ASA Server");
    expect(name).toMatch(/^my-asa-server-world-\d{8}-\d{6}\.zip$/);
  });

  it("does not produce a -zip suffix that later becomes -zip.zip", () => {
    const name = suggestedExportFileName(makeBackup({ kind: "ini" }), "Island");
    expect(name.endsWith(".zip")).toBe(true);
    expect(name.endsWith("-zip")).toBe(false);
    expect(name.includes(".zip.zip")).toBe(false);
    expect(name.startsWith("island-ini-")).toBe(true);
  });
});

describe("slugFilePart", () => {
  it("falls back when the name has no safe characters", () => {
    expect(slugFilePart("!!!")).toBe("server");
  });
});
