import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupRecord } from "@shared/types";
import { BackupHistoryTable } from "./BackupHistoryTable";

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
};

describe("BackupHistoryTable", () => {
  it("offers the same restore action from the right-click context menu", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();

    render(
      <AppProviders>
        <BackupHistoryTable
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
          formatRelativeTime={() => "1 minute ago"}
        />
      </AppProviders>,
    );

    const row = document.querySelector("[data-backup-row]");
    expect(row).not.toBeNull();
    expect(screen.getByRole("button", { name: /Open folder/i })).toBeTruthy();
    fireEvent.contextMenu(row!);

    await user.click(await screen.findByRole("menuitem", { name: /^Restore$/ }));
    expect(onRestore).toHaveBeenCalledWith(backup);
  });
});
