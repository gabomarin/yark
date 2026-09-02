import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupRecord } from "@shared/types";
import { BackupHistoryTable, sortBackupRecords } from "./BackupHistoryTable";

const backup: BackupRecord = {
  id: "bk-world",
  serverId: "srv-1",
  type: "manual",
  kind: "world",
  path: "C:/backups/world/bk-world.zip",
  sizeBytes: 1024,
  status: "completed",
  createdAt: "2026-07-23T00:00:00.000Z",
  completedAt: "2026-07-23T00:01:00.000Z",
  notes: null,
  mapToken: "TheIsland_WP",
};

const playersBackup: BackupRecord = {
  ...backup,
  id: "bk-players",
  kind: "players",
  path: "C:/backups/players/bk-players.zip",
  mapToken: null,
};

describe("BackupHistoryTable", () => {
  it("offers the same restore action from the right-click context menu", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();

    render(
      <AppProviders>
        <BackupHistoryTable
          kind="world"
          records={[backup]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          onSelectedIdsChange={vi.fn()}
          onCopyDetails={vi.fn()}
          onOpenFolder={vi.fn()}
          onExport={vi.fn()}
          onRestore={onRestore}
          onDelete={vi.fn()}
          formatSize={() => "1.0 KB"}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /File/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Map/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Date/i })).toBeTruthy();
    expect(screen.getByText("TheIsland_WP")).toBeTruthy();

    const row = document.querySelector("[data-backup-row]");
    expect(row).not.toBeNull();
    expect(screen.getByRole("button", { name: /Open folder/i })).toBeTruthy();
    fireEvent.contextMenu(row!);

    await user.click(await screen.findByRole("menuitem", { name: /^Restore$/ }));
    expect(onRestore).toHaveBeenCalledWith(backup);
  });

  it("hides the Map column for players and INI history", () => {
    const { rerender } = render(
      <AppProviders>
        <BackupHistoryTable
          kind="players"
          records={[playersBackup]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          onSelectedIdsChange={vi.fn()}
          onCopyDetails={vi.fn()}
          onOpenFolder={vi.fn()}
          onExport={vi.fn()}
          onRestore={vi.fn()}
          onDelete={vi.fn()}
          formatSize={() => "1.0 KB"}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: /Map/i })).toBeNull();

    rerender(
      <AppProviders>
        <BackupHistoryTable
          kind="ini"
          records={[{ ...playersBackup, id: "bk-ini", kind: "ini", path: "C:/backups/ini/x.zip" }]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          onSelectedIdsChange={vi.fn()}
          onCopyDetails={vi.fn()}
          onOpenFolder={vi.fn()}
          onExport={vi.fn()}
          onRestore={vi.fn()}
          onDelete={vi.fn()}
          formatSize={() => "1.0 KB"}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: /Map/i })).toBeNull();
  });

  it("sorts by Date (finishedAt) newest first by default", () => {
    const older: BackupRecord = {
      ...backup,
      id: "bk-older",
      path: "C:/backups/world/bk-older.zip",
      completedAt: "2026-07-22T00:01:00.000Z",
    };
    const newer: BackupRecord = {
      ...backup,
      id: "bk-newer",
      path: "C:/backups/world/bk-newer.zip",
      completedAt: "2026-07-24T00:01:00.000Z",
    };
    const sorted = sortBackupRecords([older, newer, backup], {
      columnAccessor: "when",
      direction: "desc",
    });
    expect(sorted.map((row) => row.id)).toEqual(["bk-newer", "bk-world", "bk-older"]);
  });

  it("toggles Date sort from the column header", async () => {
    const user = userEvent.setup();
    const older: BackupRecord = {
      ...backup,
      id: "bk-older",
      path: "C:/backups/world/bk-older.zip",
      completedAt: "2026-07-22T00:01:00.000Z",
    };
    const newer: BackupRecord = {
      ...backup,
      id: "bk-newer",
      path: "C:/backups/world/bk-newer.zip",
      completedAt: "2026-07-24T00:01:00.000Z",
    };

    render(
      <AppProviders>
        <BackupHistoryTable
          kind="world"
          records={[older, newer]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          onSelectedIdsChange={vi.fn()}
          onCopyDetails={vi.fn()}
          onOpenFolder={vi.fn()}
          onExport={vi.fn()}
          onRestore={vi.fn()}
          onDelete={vi.fn()}
          formatSize={() => "1.0 KB"}
        />
      </AppProviders>,
    );

    const filenames = () =>
      Array.from(document.querySelectorAll("[data-backup-filename]")).map(
        (node) => node.textContent,
      );
    expect(filenames()[0]).toBe("bk-newer.zip");

    await user.click(screen.getByRole("button", { name: /Date/i }));
    expect(filenames()[0]).toBe("bk-older.zip");
  });
});
