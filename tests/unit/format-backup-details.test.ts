import { describe, expect, it } from "vitest";
import { formatBackupDetails } from "../../src/renderer/src/features/backups/formatBackupDetails";
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
    };
    const text = formatBackupDetails({ id: "srv-a", name: "Island" }, backup);
    expect(text).toContain("Server: Island (srv-a)");
    expect(text).toContain("Backup ID: bak-1");
    expect(text).toContain("Type: scheduled");
    expect(text).toContain("Kind: world");
    expect(text).toContain("Status: failed");
    expect(text).toContain("Path: C:\\Backups\\World\\a.zip");
    expect(text).toContain("ENOENT: no such file or directory");
  });
});
