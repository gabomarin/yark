import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { defaultMaintenancePolicy } from "@shared/maintenance/maintenance-policy";
import { MaintenanceManualRestartSection } from "./MaintenanceManualRestartSection";

describe("MaintenanceManualRestartSection", () => {
  it("locks manual restart settings while a live countdown is queued", () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      manualRestartWarningsEnabled: true,
      schedulePaused: false,
      nextRestartAt: null,
      countdownRemainingMs: null,
      countdownPhase: "idle" as const,
      countdownKind: null,
      lastRestartAt: null,
      lastRestartOk: null,
      lastUpdateAt: null,
      lastUpdateOk: null,
      steamUpdateAvailable: false,
      lastWipeAt: null,
      lastWipeOk: null,
      cancelable: false,
    };

    render(
      <AppProviders>
        <MaintenanceManualRestartSection
          policy={policy}
          busy={false}
          open
          manualRestartPending
          onToggleOpen={vi.fn()}
          onOpen={vi.fn()}
          patch={vi.fn(async () => true)}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/manual restart is queued/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable manual restart warnings" })).toBeDisabled();
  });
});
