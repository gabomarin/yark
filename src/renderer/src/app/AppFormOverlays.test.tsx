import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ServerProfile } from "@shared/types";
import { AppFormOverlays } from "./AppFormOverlays";
import type { AppShellChromeProps } from "./appShellChrome";
import type { AppFleetSlice, AppSettingsSlice } from "./model/appMainRouterSlices";

vi.mock("@app/appShellChrome", () => ({
  AppShellWithChrome: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@features/servers/components/ServerForm/ServerForm", () => ({
  ServerForm: ({
    initial,
    onSaved,
  }: {
    initial: ServerProfile | null;
    onSaved: (created?: ServerProfile) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSaved(
          initial === null
            ? ({ id: "srv-new", name: "Alpha" } as ServerProfile)
            : undefined,
        )
      }
    >
      save-form
    </button>
  ),
}));

const existing = { id: "srv-a", name: "Island" } as ServerProfile;

function chrome(): AppShellChromeProps {
  return {
    navigate: vi.fn(),
    steamCmdDetected: true,
    steamCmdRunning: false,
    officialVersion: null,
    officialNetworkStatus: "unknown",
    yarkUpdateAvailableVersion: null,
    onWhatsNewClick: vi.fn(),
    onYarkUpdateClick: vi.fn(),
    busyOverlay: null,
    downloadCount: 0,
    workspaceFooter: null,
  };
}

function renderOverlay(
  overlay: { kind: "create" } | { kind: "edit"; profile: ServerProfile },
  extras: {
    clearOverviewSearch: () => void;
    setOverlay: ReturnType<typeof vi.fn>;
  },
): void {
  render(
    <AppFormOverlays
      shell={chrome()}
      overlay={overlay}
      setOverlay={extras.setOverlay}
      navigate={vi.fn()}
      fleet={{ servers: [], refresh: vi.fn() } as unknown as AppFleetSlice}
      settings={
        { defaultBaseFolder: "C:\\ark", extraClusterOptions: [] } as unknown as AppSettingsSlice
      }
      registerOverlayLeaveGuard={vi.fn()}
      runWithOverlayLeaveGuard={(action) => action()}
      consumePendingSetupCluster={vi.fn()}
      clearOverviewSearch={extras.clearOverviewSearch}
    />,
  );
}

describe("AppFormOverlays overview search", () => {
  it("clears Overview search after a successful create", async () => {
    const user = userEvent.setup();
    const clearOverviewSearch = vi.fn();
    const setOverlay = vi.fn();
    renderOverlay({ kind: "create" }, { clearOverviewSearch, setOverlay });

    await user.click(screen.getByRole("button", { name: "save-form" }));
    expect(clearOverviewSearch).toHaveBeenCalledOnce();
    expect(setOverlay).toHaveBeenCalledWith({
      kind: "workspace",
      serverId: "srv-new",
      onboarding: true,
    });
  });

  it("does not clear Overview search after an edit save", async () => {
    const user = userEvent.setup();
    const clearOverviewSearch = vi.fn();
    const setOverlay = vi.fn();
    renderOverlay(
      { kind: "edit", profile: existing },
      { clearOverviewSearch, setOverlay },
    );

    await user.click(screen.getByRole("button", { name: "save-form" }));
    expect(clearOverviewSearch).not.toHaveBeenCalled();
    expect(setOverlay).toHaveBeenCalledWith(null);
  });
});
