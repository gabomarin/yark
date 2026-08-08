import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AppProviders } from "@app/AppProviders";
import { DEFAULT_LOG_RETENTION_SETTINGS } from "@shared/log-retention";
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
  criticalJobs: [],
  checkedAt: "2026-07-23T00:00:00.000Z",
};

function stubSettingsApi(
  overrides: Record<string, unknown> = {},
): void {
  vi.stubGlobal("api", {
    listAppDataFolders: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    openAppDataFolder: vi.fn(),
    pickPath: vi.fn(),
    getDesktopShellPreferences: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
      },
    }),
    setCloseWindowToTray: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setStartWithWindows: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setTrayCloseHintDismissed: vi.fn().mockResolvedValue({ ok: true, data: false }),
    getAppUpdateStatus: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        phase: "idle",
        currentVersion: "0.1.0",
        availableVersion: null,
        percent: null,
        error: null,
        isPackaged: true,
        releasePageUrl: "https://github.com/gabomarin/yark/releases",
        releaseNotesUrl: null,
        installBlockedReason: "not-ready",
        installBlockedMessage: "Download the update before restarting to install.",
      },
    }),
    checkForAppUpdate: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        phase: "up-to-date",
        currentVersion: "0.1.0",
        availableVersion: null,
        percent: null,
        error: null,
        isPackaged: true,
        releasePageUrl: "https://github.com/gabomarin/yark/releases",
        releaseNotesUrl: null,
        installBlockedReason: "not-ready",
        installBlockedMessage: "Download the update before restarting to install.",
      },
    }),
    downloadAppUpdate: vi.fn(),
    installAppUpdate: vi.fn(),
    openYarkReleaseNotes: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    onAppUpdate: vi.fn().mockReturnValue(() => undefined),
    getLogRetentionSettings: vi.fn().mockResolvedValue({
      ok: true,
      data: { ...DEFAULT_LOG_RETENTION_SETTINGS },
    }),
    setLogRetentionSettings: vi.fn().mockImplementation(async (settings) => ({
      ok: true,
      data: settings,
    })),
    previewLogCleanup: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        items: [],
        totalBytes: 0,
        byCategory: [
          { category: "events", count: 0, bytes: 0 },
          { category: "updateLogs", count: 0, bytes: 0 },
        ],
        byServer: [],
      },
    }),
    runLogCleanup: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        deleted: 0,
        freedBytes: 0,
        byCategory: [
          { category: "events", deleted: 0, bytes: 0 },
          { category: "updateLogs", deleted: 0, bytes: 0 },
        ],
        skipped: [],
        failed: [],
      },
    }),
    ...overrides,
  });
}

function renderSettings(
  overrides: Partial<ComponentProps<typeof SettingsPage>> = {},
): void {
  render(
    <AppProviders>
      <SettingsPage
        appVersion="0.1.0"
        steamCmdStatus={readyStatus}
        servers={[]}
        installationInfo={new Map()}
        onOpenServer={vi.fn()}
        openNativeTerminalOnStart={false}
        onOpenNativeTerminalOnStartChange={vi.fn()}
        uiDensity="compact"
        onUiDensityChange={vi.fn()}
        defaultBaseFolder={null}
        onDefaultBaseFolderChange={vi.fn()}
        onPickSteamCmdPath={vi.fn()}
        onInstallSteamCmd={vi.fn()}
        onOpenSteamCmdCache={vi.fn()}
        onClearSteamCmdCache={vi.fn()}
        {...overrides}
      />
    </AppProviders>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders compact SteamCMD, general preference, and version footer", async () => {
    stubSettingsApi({
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { kind: "app", label: "App data", path: "C:/Users/me/AppData/Roaming/yark" },
        ],
      }),
    });

    renderSettings();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Command palette")).toBeInTheDocument();
    expect(screen.getByText(/Ctrl/i)).toBeInTheDocument();
    expect(screen.getByText("Close window to tray")).toBeInTheDocument();
    expect(screen.getByText("Show notification when hiding to tray")).toBeInTheDocument();
    expect(screen.getByText("Start with Windows")).toBeInTheDocument();
    expect(screen.queryByText("On quit with active servers")).not.toBeInTheDocument();
    expect(screen.getByText("Display size")).toBeInTheDocument();
    expect(screen.getByLabelText("Display size")).toBeInTheDocument();
    expect(screen.getByText("Default base folder")).toBeInTheDocument();
    expect(document.querySelector("[data-steamcmd-path]")).toHaveTextContent(
      "C:/steamcmd/steamcmd.exe",
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Download cache")).not.toBeInTheDocument();
    expect(screen.getByText(/YARK server manager · v0.1.0/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(window.api.listAppDataFolders).toHaveBeenCalled();
      expect(window.api.getDesktopShellPreferences).toHaveBeenCalled();
    });
  });

  it("notifies when display size changes to Comfortable", async () => {
    const user = userEvent.setup();
    const onUiDensityChange = vi.fn();
    stubSettingsApi();

    renderSettings({ onUiDensityChange });

    await user.click(screen.getByRole("radio", { name: "Comfortable" }));
    expect(onUiDensityChange).toHaveBeenCalledWith("comfortable");
  });

  it("persists dismissing the tray-hide notification", async () => {
    const user = userEvent.setup();
    stubSettingsApi();

    renderSettings();

    await waitFor(() => {
      expect(window.api.getDesktopShellPreferences).toHaveBeenCalled();
    });

    const toastSwitch = await screen.findByRole("switch", {
      name: "Show notification when hiding to tray",
    });
    expect(toastSwitch).toBeChecked();
    await user.click(toastSwitch);
    await waitFor(() => {
      expect(window.api.setTrayCloseHintDismissed).toHaveBeenCalledWith(true);
    });
  });

  it("expands caches and supports open/clear actions", async () => {
    const user = userEvent.setup();
    const onOpenSteamCmdCache = vi.fn();
    const onClearSteamCmdCache = vi.fn();
    stubSettingsApi();

    renderSettings({
      onOpenSteamCmdCache,
      onClearSteamCmdCache,
    });

    await user.click(screen.getByRole("button", { name: /Shared caches/i }));
    expect(screen.getByText("Download cache")).toBeInTheDocument();
    expect(screen.getByText("Shared server files")).toBeInTheDocument();
    expect(
      screen.getByText(/Temporary files Steam already downloaded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/set up new servers faster/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^Open$/i })[0]!);
    expect(onOpenSteamCmdCache).toHaveBeenCalledWith("depot");

    await user.click(screen.getAllByRole("button", { name: /^Clear$/i })[2]!);
    expect(onClearSteamCmdCache).toHaveBeenCalledWith("content");
  });

  it("picks and clears default base folder; opens app data folders", async () => {
    const user = userEvent.setup();
    const onDefaultBaseFolderChange = vi.fn();
    const openAppDataFolder = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    stubSettingsApi({
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { kind: "app", label: "App data", path: "C:/Users/me/AppData/Roaming/yark" },
          { kind: "backups", label: "Backups", path: "C:/Users/me/AppData/Roaming/yark/backups" },
        ],
      }),
      openAppDataFolder,
      pickPath: vi.fn().mockResolvedValue({ ok: true, data: "D:/ARK" }),
    });

    renderSettings({
      defaultBaseFolder: null,
      onDefaultBaseFolderChange,
    });

    const baseRow = document.querySelector("[data-default-base-folder]");
    expect(baseRow).not.toBeNull();
    await user.click(
      Array.from(baseRow!.querySelectorAll("button")).find((el) =>
        /Choose/i.test(el.textContent ?? ""),
      )!,
    );
    expect(onDefaultBaseFolderChange).toHaveBeenCalledWith("D:/ARK");

    cleanup();
    renderSettings({
      defaultBaseFolder: "D:/ARK",
      onDefaultBaseFolderChange,
    });
    const baseRowFilled = document.querySelector("[data-default-base-folder]");
    await user.click(
      Array.from(baseRowFilled!.querySelectorAll("button")).find((el) =>
        /^Clear$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(onDefaultBaseFolderChange).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: /App data folders/i }));
    await waitFor(() => {
      expect(screen.getByText("App data")).toBeInTheDocument();
    });
    const dataSection = document.querySelector("[data-app-data-folders]");
    await user.click(
      Array.from(dataSection!.querySelectorAll("button")).find((el) =>
        /^Open$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(openAppDataFolder).toHaveBeenCalledWith("app");
  });

  it("shows install when SteamCMD is missing and toggles native console", async () => {
    const user = userEvent.setup();
    const onOpenNativeTerminalOnStartChange = vi.fn();
    stubSettingsApi();

    renderSettings({
      steamCmdStatus: {
        ...readyStatus,
        detected: false,
        executablePath: null,
        depotCacheDir: null,
        contentCacheDir: null,
      },
      onOpenNativeTerminalOnStartChange,
    });

    expect(screen.getByText("Needs setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Install SteamCMD/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Shared caches/i }));
    expect(screen.getAllByRole("button", { name: /^Open$/i })[0]).toBeDisabled();

    await user.click(
      screen.getByRole("switch", {
        name: /Show native console when starting or restarting a server/i,
      }),
    );
    expect(onOpenNativeTerminalOnStartChange).toHaveBeenCalledWith(true);
  });

  it("loads log retention defaults and opens cleanup preview", async () => {
    const user = userEvent.setup();
    const previewLogCleanup = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            category: "events",
            serverId: "srv-1",
            serverName: "Alpha",
            targetKey: "9",
            label: "old event",
            reason: "older than 90d",
            sizeBytes: 0,
          },
        ],
        totalBytes: 0,
        byCategory: [
          { category: "events", count: 1, bytes: 0 },
          { category: "updateLogs", count: 0, bytes: 0 },
        ],
        byServer: [{ serverId: "srv-1", serverName: "Alpha", count: 1, bytes: 0 }],
      },
    });
    stubSettingsApi({ previewLogCleanup });

    renderSettings();

    await waitFor(() => {
      expect(window.api.getLogRetentionSettings).toHaveBeenCalled();
    });
    expect(screen.getByText("Log retention")).toBeInTheDocument();
    expect(screen.getByLabelText("Keep everyday activity history for days")).toHaveValue("90");

    await user.click(screen.getByRole("button", { name: /Clean up now/i }));
    expect(screen.getByText("Clean up old logs")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Scan$/i }));
    await waitFor(() => {
      expect(previewLogCleanup).toHaveBeenCalled();
      expect(screen.getByText(/Will remove 1 item/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Remove 1$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Scan$/i })).not.toBeInTheDocument();
  });

  it("checks for YARK updates and shows an available status", async () => {
    const user = userEvent.setup();
    const checkForAppUpdate = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        phase: "available",
        currentVersion: "0.1.0",
        availableVersion: "0.2.0",
        percent: null,
        error: null,
        isPackaged: true,
        releasePageUrl: "https://github.com/gabomarin/yark/releases",
        releaseNotesUrl: "https://github.com/gabomarin/yark/releases/tag/v0.2.0",
        installBlockedReason: "not-ready",
        installBlockedMessage: "Download the update before restarting to install.",
      },
    });
    stubSettingsApi({ checkForAppUpdate });

    renderSettings();

    await waitFor(() => {
      expect(window.api.getAppUpdateStatus).toHaveBeenCalled();
    });
    expect(screen.getByText("YARK updates")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Check now/i }));
    await waitFor(() => {
      expect(checkForAppUpdate).toHaveBeenCalled();
      expect(screen.getByText(/Update available · v0\.2\.0/i)).toBeInTheDocument();
    });
  });
});
