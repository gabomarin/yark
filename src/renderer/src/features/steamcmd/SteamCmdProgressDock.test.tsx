import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamCmdStatus } from "@shared/types";
import { AppProviders } from "@app/AppProviders";
import { SteamCmdProgressDock } from "./SteamCmdProgressDock";

function baseStatus(overrides: Partial<SteamCmdStatus> = {}): SteamCmdStatus {
  return {
    detected: true,
    executablePath: "C:/steamcmd/steamcmd.exe",
    depotCacheDir: "C:/steamcmd/steamapps/depotcache",
    contentCacheDir: "C:/steamcmd/asa_content_cache",
    busy: true,
    running: true,
    operation: "sync-files",
    serverId: "srv-1",
    startedAt: "2026-07-27T00:00:00.000Z",
    pid: null,
    progressPercent: null,
    progressLabel: "Copying files to server…",
    progressBytesDownloaded: null,
    progressBytesTotal: null,
    lastLine: "Copying files to server…",
    queuedCount: 0,
    checkedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("SteamCmdProgressDock (#48 sync UX)", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not show 0 / 0 MB while copying files (stale empty totals)", () => {
    render(
      <AppProviders>
        <SteamCmdProgressDock
          status={baseStatus({
            progressPercent: null,
            progressBytesDownloaded: 0,
            progressBytesTotal: 0,
          })}
          console={{
            lines: ["Reusing ASA content cache", "Still copying files… (5s elapsed)"],
            updatedAt: "2026-07-27T00:00:00.000Z",
          }}
          serverName="Island"
          onCancel={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/Copying files to the server/i)).toBeInTheDocument();
    expect(screen.getByText(/Copying files to server/i)).toBeInTheDocument();
    expect(screen.queryByText(/0\.0\s*\/\s*0\.0\s*MB/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Copied:/i)).not.toBeInTheDocument();
    // Indeterminate sync: no numeric percent label (full animated bar instead).
    expect(screen.queryByText(/93\.0%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/100\.0%/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("still shows meaningful byte progress for downloads", () => {
    render(
      <AppProviders>
        <SteamCmdProgressDock
          status={baseStatus({
            operation: "install-files",
            progressPercent: 45,
            progressLabel: "Downloading · 512.0 / 1024.0 MB",
            progressBytesDownloaded: 536870912,
            progressBytesTotal: 1073741824,
          })}
          console={null}
          onCancel={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/Downloaded:/i)).toBeInTheDocument();
    expect(screen.getByText(/512\.0 \/ 1024\.0 MB/i)).toBeInTheDocument();
  });

  it("keeps Cancel interactive during sync-files", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AppProviders>
        <SteamCmdProgressDock
          status={baseStatus()}
          console={{ lines: ["Still copying files… (10s elapsed)"], updatedAt: "2026-07-27T00:00:00.000Z" }}
          onCancel={onCancel}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
