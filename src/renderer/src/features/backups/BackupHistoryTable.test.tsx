import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupRecord } from "@shared/types";
import { BackupHistoryTable, sortBackupRecords } from "./BackupHistoryTable";
import { filterBackupRecordsByMeta } from "./backupHistoryMetaFilter";

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
  isProtected: false,
  operatorNote: "",
  diskMissing: false,
};

const playersBackup: BackupRecord = {
  ...backup,
  id: "bk-players",
  kind: "players",
  path: "C:/backups/players/bk-players.zip",
  mapToken: null,
  isProtected: false,
  operatorNote: "",
  diskMissing: false,
};

const tableHandlers = {
  onSelectedIdsChange: vi.fn(),
  onCopyDetails: vi.fn(),
  onOpenFolder: vi.fn(),
  onExport: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
  onProtect: vi.fn(),
  onSaveProtection: vi.fn().mockResolvedValue(true),
  formatSize: () => "1.0 KB",
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
          {...tableHandlers}
          onRestore={onRestore}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: /File/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Map$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Status$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Type$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Date/i })).toBeTruthy();
    expect(screen.getByText("The Island · Manual")).toBeTruthy();
    expect(document.querySelector('[data-backup-status="completed"]')).not.toBeNull();

    const row = document.querySelector("[data-backup-row]");
    expect(row).not.toBeNull();
    expect(screen.getByRole("button", { name: /Open folder/i })).toBeTruthy();
    fireEvent.contextMenu(row!);

    await user.click(await screen.findByRole("menuitem", { name: /^Restore$/ }));
    expect(onRestore).toHaveBeenCalledWith(backup);
  });

  it("does not show Map / Status / Type columns for any kind", () => {
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
          {...tableHandlers}
        />
      </AppProviders>,
    );

    expect(document.querySelector('th[data-accessor="mapToken"]')).toBeNull();
    expect(document.querySelector('th[data-accessor="path"]')?.textContent).toContain("Player");

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
          {...tableHandlers}
        />
      </AppProviders>,
    );

    expect(document.querySelector('th[data-accessor="mapToken"]')).toBeNull();
    expect(document.querySelector('th[data-accessor="path"]')?.textContent).toContain("File");
  });

  it("marks missing-on-disk archives and blocks restore/export", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const missing: BackupRecord = { ...backup, id: "bk-missing", diskMissing: true };

    render(
      <AppProviders>
        <BackupHistoryTable
          kind="world"
          records={[missing]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          {...tableHandlers}
          onRestore={onRestore}
        />
      </AppProviders>,
    );

    expect(document.querySelector('[data-backup-status="missing"]')).not.toBeNull();
    expect(document.querySelector('[data-backup-disk-missing="true"]')).not.toBeNull();
    expect(screen.getByRole("status", { name: /Missing on disk/i })).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Restore backup/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export backup/i })).toBeDisabled();

    const row = document.querySelector("[data-backup-row]");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    const restoreItem = await screen.findByRole("menuitem", { name: /^Restore$/ });
    expect(restoreItem).toHaveAttribute("data-disabled", "true");
    await user.click(restoreItem);
    expect(onRestore).not.toHaveBeenCalled();
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

  it("filters by Status and Type via the File header filter", async () => {
    const user = userEvent.setup();
    const failed: BackupRecord = {
      ...backup,
      id: "bk-failed",
      path: "C:/backups/world/bk-failed.zip",
      status: "failed",
      type: "scheduled",
    };
    const preStop: BackupRecord = {
      ...backup,
      id: "bk-pre-stop",
      path: "C:/backups/world/bk-pre-stop.zip",
      type: "pre_stop",
    };

    render(
      <AppProviders>
        <BackupHistoryTable
          kind="world"
          records={[backup, failed, preStop]}
          selectedIds={[]}
          busy={false}
          opsLocked={false}
          fetching={false}
          emptyHint="No backups yet"
          {...tableHandlers}
        />
      </AppProviders>,
    );

    expect(document.querySelectorAll("[data-backup-row]")).toHaveLength(3);

    const fileHeader = document.querySelector('th[data-accessor="path"]');
    expect(fileHeader).not.toBeNull();
    const filterButton = fileHeader!.querySelector(".mantine-datatable-header-cell-filter-action-icon");
    expect(filterButton).not.toBeNull();
    await user.click(filterButton!);

    const statusFilter = await screen.findByRole("combobox", { name: /^Status$/i });
    await user.click(statusFilter);
    await user.click(await screen.findByRole("option", { name: /^Failed$/i }));

    expect(document.querySelectorAll("[data-backup-row]")).toHaveLength(1);
    expect(document.querySelector('[data-backup-id="bk-failed"]')).not.toBeNull();

    // Headers keep stable accessors while filtered (and when empty).
    expect(document.querySelector('th[data-accessor="path"]')).not.toBeNull();
    expect(document.querySelector('th[data-accessor="actions"]')).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(document.querySelectorAll("[data-backup-row]")).toHaveLength(3);
  });

  it("shows a filter-empty message and keeps column headers", async () => {
    const user = userEvent.setup();
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
          {...tableHandlers}
        />
      </AppProviders>,
    );

    const fileHeader = document.querySelector('th[data-accessor="path"]');
    const filterButton = fileHeader!.querySelector(".mantine-datatable-header-cell-filter-action-icon");
    await user.click(filterButton!);
    await user.click(await screen.findByRole("combobox", { name: /^Status$/i }));
    await user.click(await screen.findByRole("option", { name: /^Failed$/i }));

    expect(await screen.findByText(/No matching backups/i)).toBeTruthy();
    expect(screen.getByText(/Clear the File column filters/i)).toBeTruthy();
    expect(document.querySelector('th[data-accessor="path"]')).not.toBeNull();
    expect(document.querySelector('th[data-accessor="when"]')).not.toBeNull();
    expect(document.querySelector('th[data-accessor="actions"]')).not.toBeNull();
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
          {...tableHandlers}
        />
      </AppProviders>,
    );

    const filenames = () =>
      Array.from(document.querySelectorAll("[data-backup-filename]")).map((node) => node.textContent);
    expect(filenames()[0]).toBe("bk-newer.zip");

    await user.click(screen.getByRole("button", { name: /Date/i }));
    expect(filenames()[0]).toBe("bk-older.zip");
  });
});

describe("filterBackupRecordsByMeta", () => {
  it("keeps all rows when Status and Type selections are empty", () => {
    expect(filterBackupRecordsByMeta([backup, playersBackup], { statuses: [], types: [] })).toHaveLength(2);
  });

  it("narrows by Status and Type membership", () => {
    const failed: BackupRecord = { ...backup, id: "bk-failed", status: "failed", type: "scheduled" };
    const filtered = filterBackupRecordsByMeta([backup, failed], {
      statuses: ["failed"],
      types: ["scheduled"],
    });
    expect(filtered.map((row) => row.id)).toEqual(["bk-failed"]);
  });
});
