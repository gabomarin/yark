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
    message:
      "Gabo Scorched yark: world schedule is on but no completed world backup exists yet (start the server so the world schedule can run)",
  },
  {
    id: "a2",
    kind: "failed",
    severity: "error",
    serverId: "srv-2",
    volumePath: null,
    message: "Gabo Scorched yark1: 1 failed world backup in the last 24h",
  },
  {
    id: "a3",
    kind: "disk_warning",
    severity: "warning",
    serverId: null,
    volumePath: "C:\\",
    message: "C:\\: 90% used (warning threshold)",
  },
];

describe("BackupFleetAlertsPanel", () => {
  it("renders a compact scrollable panel with actions", async () => {
    const user = userEvent.setup();
    const onOpenServerBackups = vi.fn();
    const onOpenServerLogs = vi.fn();
    const onOpenCleanup = vi.fn();

    render(
      <AppProviders>
        <BackupFleetAlertsPanel
          alerts={alerts}
          onOpenServerBackups={onOpenServerBackups}
          onOpenServerLogs={onOpenServerLogs}
          onOpenCleanup={onOpenCleanup}
        />
      </AppProviders>,
    );

    expect(screen.getByLabelText("Backup alerts")).toBeInTheDocument();
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();

    expect(document.querySelector("[data-backup-alerts-list]")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(onOpenServerLogs).toHaveBeenCalledWith("srv-2");

    await user.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    expect(onOpenServerBackups).toHaveBeenCalledWith("srv-1");

    await user.click(screen.getByRole("button", { name: /Cleanup/i }));
    expect(onOpenCleanup).toHaveBeenCalled();
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
