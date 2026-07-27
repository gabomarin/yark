import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { SteamCmdStatus } from "@shared/types";
import { SettingsPage } from "./SettingsPage";

const readyStatus: SteamCmdStatus = {
  detected: true,
  executablePath: "C:/steamcmd/steamcmd.exe",
  depotCacheDir: "C:/steamcmd/steamapps/depotcache",
  contentCacheDir: "C:/steamcmd/asa_content_cache",
  busy: false,
  running: false,
  operation: null,
  serverId: null,
  startedAt: null,
  pid: null,
  progressPercent: null,
  progressLabel: null,
  progressBytesDownloaded: null,
  progressBytesTotal: null,
  lastLine: null,
  queuedCount: 0,
  checkedAt: "2026-07-23T00:00:00.000Z",
};

describe("SettingsPage", () => {
  afterEach(cleanup);

  it("renders SteamCMD path, startup preference, and version", () => {
    render(
      <AppProviders>
        <SettingsPage
          appVersion="0.1.0"
          steamCmdStatus={readyStatus}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(document.querySelector("[data-steamcmd-path]")).toHaveTextContent(
      "C:/steamcmd/steamcmd.exe",
    );
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.queryByText("Depotcache")).not.toBeInTheDocument();
    expect(screen.getByText("Version 0.1.0")).toBeInTheDocument();
    expect(document.querySelector("[data-settings-page]")).toBeInTheDocument();
    expect(document.querySelector('[data-fill-viewport="true"]')).toBeInTheDocument();
  });

  it("shows install action when SteamCMD is missing and toggles native console", async () => {
    const user = userEvent.setup();
    const onOpenNativeTerminalOnStartChange = vi.fn();

    render(
      <AppProviders>
        <SettingsPage
          appVersion="0.1.0"
          steamCmdStatus={{
            ...readyStatus,
            detected: false,
            executablePath: null,
          }}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={onOpenNativeTerminalOnStartChange}
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Install SteamCMD/i })).toBeInTheDocument();

    await user.click(
      screen.getByRole("switch", {
        name: /Show native console when starting or restarting a server/i,
      }),
    );
    expect(onOpenNativeTerminalOnStartChange).toHaveBeenCalledWith(true);
  });
});
