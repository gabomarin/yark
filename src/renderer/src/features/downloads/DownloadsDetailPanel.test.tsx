import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { DownloadRow } from "./downloadsModel";
import { DownloadsDetailPanel } from "./DownloadsDetailPanel";

afterEach(cleanup);

function row(overrides: Partial<DownloadRow> = {}): DownloadRow {
  return {
    id: "job-1",
    kind: "active",
    serverId: "srv-1",
    eventId: null,
    title: "Island",
    subtitle: "Updating server",
    serverName: "Island",
    mapId: "TheIsland",
    mapModId: null,
    modThumbnailUrl: null,
    statusLabel: "running",
    phase: "downloading",
    percent: 42,
    byteProgress: "12.0 / 24.0 MB",
    byteProgressNoun: "Downloaded",
    job: null,
    usesLiveCancel: true,
    canPause: true,
    reorderable: false,
    canMoveUp: false,
    canMoveDown: false,
    ...overrides,
  };
}

describe("DownloadsDetailPanel", () => {
  it("keeps the SteamCMD process bar on the active job only", () => {
    render(
      <AppProviders>
        <DownloadsDetailPanel
          selected={row({
            id: "queued-1",
            kind: "queued",
            usesLiveCancel: false,
            canPause: false,
            percent: null,
            title: "Center",
            job: {
              id: "queued-1",
              operation: "update",
              serverId: "srv-2",
              serverName: "Center",
              status: "pending",
              phase: "queued",
              attempts: 0,
              maxAttempts: 3,
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
              lastError: null,
              recoveryReason: null,
              nextActions: ["cancel"],
            },
          })}
          liveRow={row({ id: "live-1", title: "Island" })}
          consoleBody="progress: 42"
          onOpenLogs={vi.fn()}
          onCancelLive={vi.fn()}
          onPauseLive={vi.fn()}
          onCancelRow={vi.fn()}
          onRetryJob={vi.fn()}
          onResumeJob={vi.fn()}
          onDismissJob={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("group", { name: "SteamCMD process" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel SteamCMD" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause SteamCMD" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from queue" })).toBeEnabled();
    expect(screen.getByText(/starts after SteamCMD finishes Island/i)).toBeInTheDocument();
    expect(screen.queryByText("progress: 42")).not.toBeInTheDocument();
    expect(screen.getByText("Center")).toBeInTheDocument();
  });

  it("labels Pause as a SteamCMD process action on the active job", () => {
    render(
      <AppProviders>
        <DownloadsDetailPanel
          selected={row()}
          liveRow={row()}
          consoleBody="progress: 42"
          onOpenLogs={vi.fn()}
          onCancelLive={vi.fn()}
          onPauseLive={vi.fn()}
          onCancelRow={vi.fn()}
          onRetryJob={vi.fn()}
          onResumeJob={vi.fn()}
          onDismissJob={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("group", { name: "SteamCMD process" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause SteamCMD" })).toBeInTheDocument();
    expect(screen.getByText("progress: 42")).toBeInTheDocument();
  });

  it("offers Retry and Dismiss for a cancelled job in the detail panel", () => {
    const onRetryJob = vi.fn();
    render(
      <AppProviders>
        <DownloadsDetailPanel
          selected={row({
            kind: "attention",
            usesLiveCancel: false,
            canPause: false,
            percent: null,
            phase: "Cancelled",
            statusLabel: "cancelled",
            job: {
              id: "job-1",
              operation: "verify-files",
              serverId: "srv-1",
              serverName: "Island",
              status: "cancelled",
              phase: "cancelled",
              attempts: 1,
              maxAttempts: 3,
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
              lastError: null,
              recoveryReason: "Cancelled by the operator during execution.",
              nextActions: ["retry", "dismiss"],
            },
          })}
          liveRow={null}
          consoleBody=""
          onOpenLogs={vi.fn()}
          onCancelLive={vi.fn()}
          onPauseLive={vi.fn()}
          onCancelRow={vi.fn()}
          onRetryJob={onRetryJob}
          onResumeJob={vi.fn()}
          onDismissJob={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(screen.getByText(/Retry to run it again/i)).toBeInTheDocument();
  });

  it("explains when a failed leftover cannot be retried", () => {
    render(
      <AppProviders>
        <DownloadsDetailPanel
          selected={row({
            kind: "attention",
            usesLiveCancel: false,
            canPause: false,
            percent: null,
            phase: "Failed",
            statusLabel: "failed",
            job: {
              id: "job-1",
              operation: "pre-update-backup",
              serverId: "srv-1",
              serverName: "Island",
              status: "failed",
              phase: "failed",
              attempts: 1,
              maxAttempts: 3,
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
              lastError: "SteamCMD is not installed on this PC.",
              recoveryReason: null,
              nextActions: ["dismiss"],
            },
          })}
          liveRow={null}
          consoleBody="should not show"
          onOpenLogs={vi.fn()}
          onCancelLive={vi.fn()}
          onPauseLive={vi.fn()}
          onCancelRow={vi.fn()}
          onRetryJob={vi.fn()}
          onResumeJob={vi.fn()}
          onDismissJob={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(screen.getByText(/cannot be retried from here/i)).toBeInTheDocument();
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
  });
});
