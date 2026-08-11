import { describe, expect, it } from "vitest";
import { formatBackupDetails } from "@features/backups/formatBackupDetails";
import type { BackupRecord } from "@shared/types";

describe("formatBackupDetails", () => {
  it("includes diagnostic fields and notes/error text", () => {
    const backup: BackupRecord = {
      id: "bak-1",
      serverId: "srv-a",
      type: "scheduled",
      kind: "world",
      path: "C:\\Backups\\World\\a.zip",
      sizeBytes: 1024,
      status: "failed",
      createdAt: "2026-07-28T12:00:00.000Z",
      completedAt: "2026-07-28T12:01:00.000Z",
      notes:
        "ENOENT: no such file or directory, lstat 'C:\\SavedArks\\x.arkrbf'",
      mapToken: "TheIsland_WP",
    };
    const text = formatBackupDetails({ id: "srv-a", name: "Island" }, backup);
    expect(text).toContain("Server: Island (srv-a)");
    expect(text).toContain("Backup ID: bak-1");
    expect(text).toContain("Type: scheduled");
    expect(text).toContain("Kind: world");
    expect(text).toContain("Map: TheIsland_WP");
    expect(text).toContain("Status: failed");
    expect(text).toContain("Path: C:\\Backups\\World\\a.zip");
    expect(text).toContain("ENOENT: no such file or directory");
  });

  it("does not report a finish time for a running backup", () => {
    const backup: BackupRecord = {
      id: "bak-running",
      serverId: "srv-a",
      type: "scheduled",
      kind: "world",
      path: "C:\\Backups\\World\\running.zip",
      sizeBytes: 0,
      status: "running",
      createdAt: "2026-07-28T12:00:00.000Z",
      completedAt: null,
      notes: null,
      mapToken: "TheIsland_WP",
    };

    const text = formatBackupDetails({ id: "srv-a", name: "Island" }, backup);
    expect(text).toContain("Created: 2026-07-28T12:00:00.000Z");
    expect(text).toContain("Finished: (not finished)");
    expect(text).toContain("Map: TheIsland_WP");
  });
});
