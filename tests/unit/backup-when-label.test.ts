import { describe, expect, it } from "vitest";
import { formatLogDateTime } from "@shared/format-log-datetime";
import {
  BACKUP_WHEN_RECENT_MS,
  formatBackupHistoryTitle,
  formatBackupTypeLabel,
  formatBackupWhenLabel,
  formatRelativeTime,
} from "../../src/renderer/src/features/backups/model/serverBackupPanelModel";

describe("formatRelativeTime", () => {
  it("uses English relative phrases", () => {
    const now = Date.parse("2026-09-02T18:00:00.000Z");
    expect(formatRelativeTime("2026-09-02T17:50:00.000Z", now)).toBe("10 minutes ago");
    expect(formatRelativeTime("2026-09-02T15:00:00.000Z", now)).toBe("3 hours ago");
  });

  it("returns the raw string for invalid ISO", () => {
    expect(formatRelativeTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatBackupWhenLabel", () => {
  const now = Date.parse("2026-09-02T18:00:00.000Z");

  it("shows English relative within 24 hours with absolute tooltip", () => {
    const iso = "2026-09-02T12:00:00.000Z"; // 6h ago
    const label = formatBackupWhenLabel(iso, now);
    expect(label.primary).toBe("6 hours ago");
    expect(label.tooltip).toBe(formatLogDateTime(iso));
  });

  it("shows absolute past the 24h threshold with relative tooltip", () => {
    const iso = new Date(now - BACKUP_WHEN_RECENT_MS - 60_000).toISOString();
    const label = formatBackupWhenLabel(iso, now);
    expect(label.primary).toBe(formatLogDateTime(iso));
    expect(label.tooltip).toMatch(/ago|yesterday|day/i);
  });

  it("treats exactly 24 hours as absolute (not recent)", () => {
    const iso = new Date(now - BACKUP_WHEN_RECENT_MS).toISOString();
    const label = formatBackupWhenLabel(iso, now);
    expect(label.primary).toBe(formatLogDateTime(iso));
  });

  it("keeps relative just under 24 hours", () => {
    const iso = new Date(now - BACKUP_WHEN_RECENT_MS + 60_000).toISOString();
    const label = formatBackupWhenLabel(iso, now);
    expect(label.primary).toMatch(/ago|hour|minute|second|yesterday/i);
    expect(label.primary).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns the raw string for invalid ISO", () => {
    expect(formatBackupWhenLabel("nope")).toEqual({
      primary: "nope",
      tooltip: "nope",
    });
  });
});

describe("formatBackupHistoryTitle", () => {
  it("pairs a friendly map name with the backup reason", () => {
    expect(formatBackupTypeLabel("pre_stop")).toBe("Before stop");
    expect(
      formatBackupHistoryTitle({
        id: "bk-1",
        serverId: "srv-1",
        type: "scheduled",
        kind: "world",
        path: "C:/backups/world-2026.zip",
        sizeBytes: 1,
        status: "completed",
        createdAt: "2026-09-14T00:00:00.000Z",
        completedAt: "2026-09-14T00:01:00.000Z",
        notes: null,
        mapToken: "TheIsland_WP",
      }),
    ).toBe("The Island · Scheduled");
    expect(
      formatBackupHistoryTitle({
        id: "bk-ini",
        serverId: "srv-1",
        type: "ini_save",
        kind: "ini",
        path: "C:/backups/ini.zip",
        sizeBytes: 1,
        status: "completed",
        createdAt: "2026-09-14T00:00:00.000Z",
        completedAt: "2026-09-14T00:01:00.000Z",
        notes: null,
        mapToken: null,
      }),
    ).toBe("INI save");
  });
});
