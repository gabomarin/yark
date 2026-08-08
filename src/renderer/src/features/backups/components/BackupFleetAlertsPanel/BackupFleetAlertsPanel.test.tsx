import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { BackupFleetAlert } from "@shared/types";
import { BackupFleetAlertsPanel } from "./BackupFleetAlertsPanel";

afterEach(() => {
  cleanup();
});

const alerts: BackupFleetAlert[] = [
  {
    id: "a1",
    kind: "never_backed_up",
    severity: "warning",
    serverId: "srv-1",
    volumePath: null,
    fingerprint: "pending",
    message:
      "Gabo Scorched yark: world schedule is on but no completed world backup exists yet (start the server so the world schedule can run)",
  },
  {
    id: "a2",
    kind: "failed",
    severity: "error",
    serverId: "srv-2",
    volumePath: null,
    fingerprint: "bak-failed-1",
    backupId: "bak-failed-1",
    message: "Gabo Scorched yark1: 1 failed world backup in the last 24h",
  },
  {
    id: "a3",
    kind: "disk_warning",
    severity: "warning",
    serverId: null,
    volumePath: "C:\\",
    fingerprint: "u90:f20:w85:c95",
    message: "C:\\: 90% used (warning threshold)",
  },
];

describe("BackupFleetAlertsPanel", () => {
  it("renders a compact scrollable panel without duplicate Open/Logs on failed alerts", async () => {
    const user = userEvent.setup();
    const onOpenServerBackups = vi.fn();
    const onOpenFailedBackupLogs = vi.fn();
    const onOpenCleanup = vi.fn();
    const onDismissAlert = vi.fn();

    render(
      <AppProviders>
        <BackupFleetAlertsPanel
          alerts={alerts}
          onOpenServerBackups={onOpenServerBackups}
          onOpenFailedBackupLogs={onOpenFailedBackupLogs}
          onOpenCleanup={onOpenCleanup}
          onDismissAlert={onDismissAlert}
        />
      </AppProviders>,
    );

    expect(screen.getByLabelText("Backup alerts")).toBeInTheDocument();
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();

    expect(document.querySelector("[data-backup-alerts-list]")).not.toBeNull();

    // Failed alerts only offer Logs (deep-link), not Open.
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Logs" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(onOpenFailedBackupLogs).toHaveBeenCalledWith({
      serverId: "srv-2",
      backupId: "bak-failed-1",
    });
    expect(onOpenServerBackups).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenServerBackups).toHaveBeenCalledWith("srv-1");

    await user.click(screen.getByRole("button", { name: /Cleanup/i }));
    expect(onOpenCleanup).toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Dismiss" })[1]!);
    expect(onDismissAlert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a2", fingerprint: "bak-failed-1" }),
    );
  });

  it("returns null when there are no alerts", () => {
    render(
      <AppProviders>
        <BackupFleetAlertsPanel alerts={[]} onOpenServerBackups={vi.fn()} />
      </AppProviders>,
    );
    expect(screen.queryByLabelText("Backup alerts")).not.toBeInTheDocument();
  });
});
