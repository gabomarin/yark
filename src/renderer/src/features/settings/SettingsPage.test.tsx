import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
    getLastSeenChangelogVersion: vi.fn().mockResolvedValue({ ok: true, data: "0.1.0" }),
    setLastSeenChangelogVersion: vi.fn().mockResolvedValue({ ok: true, data: "0.1.0" }),
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

async function openCategory(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  const nav = screen.getByRole("navigation", { name: "Settings categories" });
  await user.click(within(nav).getByRole("button", { name: label }));
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
        desktopShell={{
          closeWindowToTray: true,
          startWithWindows: false,
          trayCloseHintDismissed: false,
          desktopShellReady: true,
          onCloseWindowToTrayChange: vi.fn(),
          onStartWithWindowsChange: vi.fn(),
          onTrayCloseHintDismissedChange: vi.fn(),
          shellError: null,
          clearShellError: vi.fn(),
        }}
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

  it("lands on General and keeps SteamCMD off-screen until that category", async () => {
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
    expect(screen.getByRole("navigation", { name: "Settings categories" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Quick jump")).toBeInTheDocument();
    expect(screen.getByText(/Ctrl/i)).toBeInTheDocument();
    expect(screen.getByText("Close window to tray")).toBeInTheDocument();
    expect(screen.getByText("Show notification when hiding to tray")).toBeInTheDocument();
    expect(screen.getByText("Start with Windows")).toBeInTheDocument();
    expect(screen.queryByText("On quit with active servers")).not.toBeInTheDocument();
    expect(screen.getByText("Display size")).toBeInTheDocument();
    expect(screen.getByLabelText("Display size")).toBeInTheDocument();
    expect(screen.queryByText("Show server console on start")).not.toBeInTheDocument();
    expect(document.querySelector("[data-steamcmd-path]")).toBeNull();
    expect(screen.queryByText(/YARK server manager · v0.1.0/i)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await openCategory(user, "SteamCMD");
    expect(document.querySelector("[data-steamcmd-path]")).toHaveTextContent(
      "C:/steamcmd/steamcmd.exe",
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Download cache")).toBeInTheDocument();
  });

  it("opens the SteamCMD category when focusSteamCmd is set", () => {
    stubSettingsApi();
    const onSteamCmdFocused = vi.fn();
    renderSettings({
      steamCmdStatus: { ...readyStatus, detected: false, executablePath: null },
      focusSteamCmd: true,
      onSteamCmdFocused,
    });

    expect(document.querySelector("[data-steamcmd-path]")).toBeInTheDocument();
    expect(onSteamCmdFocused).toHaveBeenCalled();
  });

  it("offers the setup assistant when the parent provides the callback", async () => {
    const user = userEvent.setup();
    const onRunSetupAgain = vi.fn();
    stubSettingsApi();
    renderSettings({ onRunSetupAgain });

    await user.click(screen.getByRole("button", { name: /open setup assistant/i }));
    expect(onRunSetupAgain).toHaveBeenCalledTimes(1);
  });

  it("resets panel scroll when switching categories", async () => {
    const user = userEvent.setup();
    stubSettingsApi();
    renderSettings();

    const panel = document.querySelector<HTMLElement>("[data-settings-panel-scroll]");
    expect(panel).not.toBeNull();
    panel!.scrollTop = 240;
    await openCategory(user, "Servers");
    expect(panel).toHaveProperty("scrollTop", 0);
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
    const onTrayCloseHintDismissedChange = vi.fn();
    stubSettingsApi();

    renderSettings({
      desktopShell: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
        desktopShellReady: true,
        onCloseWindowToTrayChange: vi.fn(),
        onStartWithWindowsChange: vi.fn(),
        onTrayCloseHintDismissedChange,
        shellError: null,
        clearShellError: vi.fn(),
      },
    });

    const toastSwitch = await screen.findByRole("switch", {
      name: "Show notification when hiding to tray",
    });
    expect(toastSwitch).toBeChecked();
    await user.click(toastSwitch);
    expect(onTrayCloseHintDismissedChange).toHaveBeenCalledWith(true);
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

    await openCategory(user, "SteamCMD");
    expect(screen.getByText("Download cache")).toBeInTheDocument();
    expect(screen.getByText("Shared server files")).toBeInTheDocument();
    expect(
      screen.getByText(/Temporary files Steam already downloaded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/set up new servers faster/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^Open$/i })[0]!);
    expect(onOpenSteamCmdCache).toHaveBeenCalledWith("depot");

    await user.click(screen.getAllByRole("button", { name: /^Clear$/i })[1]!);
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

    await openCategory(user, "Servers");
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
    await openCategory(user, "Servers");
    const baseRowFilled = document.querySelector("[data-default-base-folder]");
    await user.click(
      Array.from(baseRowFilled!.querySelectorAll("button")).find((el) =>
        /^Clear$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(onDefaultBaseFolderChange).toHaveBeenCalledWith(null);

    await openCategory(user, "About");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "App data folders" })).toBeInTheDocument();
    });
    const dataSection = document.querySelector("[data-app-data-folders]");
    await user.click(
      Array.from(dataSection!.querySelectorAll("button")).find((el) =>
        /^Open$/i.test(el.textContent ?? ""),
      )!,
    );
    expect(openAppDataFolder).toHaveBeenCalledWith("app");
  });

  it("notes when Bundled SteamCMD is unused because another path is configured", async () => {
    const user = userEvent.setup();
    stubSettingsApi({
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          {
            kind: "steamcmd",
            label: "Bundled SteamCMD",
            path: "C:/Users/me/AppData/Roaming/yark/steamcmd",
          },
        ],
      }),
    });

    renderSettings({
      steamCmdStatus: {
        ...readyStatus,
        executablePath: "C:/tools/steamcmd/steamcmd.exe",
      },
    });
    await openCategory(user, "About");

    await waitFor(() => {
      expect(screen.getByText("Bundled SteamCMD")).toBeInTheDocument();
    });
    expect(screen.getByText(/Not in use/i)).toBeInTheDocument();
    expect(
      screen.getByText(/using the SteamCMD you chose in Settings → SteamCMD/i),
    ).toBeInTheDocument();
  });

  it("omits the unused note when SteamCMD is the bundled copy", async () => {
    const user = userEvent.setup();
    const bundledDir = "C:/Users/me/AppData/Roaming/yark/steamcmd";
    stubSettingsApi({
      listAppDataFolders: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { kind: "steamcmd", label: "Bundled SteamCMD", path: bundledDir },
        ],
      }),
    });

    renderSettings({
      steamCmdStatus: {
        ...readyStatus,
        executablePath: `${bundledDir}/steamcmd.exe`,
      },
    });
    await openCategory(user, "About");

    await waitFor(() => {
      expect(screen.getByText("Bundled SteamCMD")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Not in use/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-bundled-steamcmd-note]")).toBeNull();
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

    await openCategory(user, "SteamCMD");
    expect(screen.getByRole("button", { name: /Install SteamCMD/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open$/i })[0]).toBeDisabled();

    await openCategory(user, "Servers");
    await user.click(
      screen.getByRole("switch", {
        name: /Show native console when a server starts/i,
      }),
    );
    expect(onOpenNativeTerminalOnStartChange).toHaveBeenCalledWith(true);
  });

  it("prevents conflicting SteamCMD actions while installation is active", async () => {
    const user = userEvent.setup();
    stubSettingsApi();

    renderSettings({
      steamCmdBusy: true,
      steamCmdStatus: {
        ...readyStatus,
        detected: false,
        executablePath: null,
        operation: "install-steamcmd",
        busy: true,
        running: true,
      },
    });

    expect(screen.getByText("Working")).toBeInTheDocument();
    await openCategory(user, "SteamCMD");
    expect(screen.getByText("Installing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^choose/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /install steamcmd/i })).toBeDisabled();
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
    await openCategory(user, "Logs");

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

  it("rolls back log retention when the IPC call rejects", async () => {
    const user = userEvent.setup();
    const setLogRetentionSettings = vi
      .fn()
      .mockRejectedValue(new Error("Settings transport unavailable"));
    stubSettingsApi({ setLogRetentionSettings });

    renderSettings();
    await openCategory(user, "Logs");

    const autoCleanup = await screen.findByRole("switch", {
      name: "Clean up logs automatically",
    });
    const initialChecked = (autoCleanup as HTMLInputElement).checked;
    await user.click(autoCleanup);

    await waitFor(() => {
      expect(screen.getByText("Settings transport unavailable")).toBeInTheDocument();
      expect((autoCleanup as HTMLInputElement).checked).toBe(initialChecked);
      expect(autoCleanup).toBeEnabled();
    });
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
    await openCategory(user, "About");

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

  it("opens the in-app What's new changelog from YARK updates (#290)", async () => {
    const user = userEvent.setup();
    stubSettingsApi();
    renderSettings({ appVersion: "0.11.0" });
    await openCategory(user, "About");

    await waitFor(() => {
      expect(window.api.getAppUpdateStatus).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: /What's new/i }));
    expect(await screen.findByText("Changelog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Got it/i })).toBeInTheDocument();
    expect(document.querySelector("[data-changelog-modal]")).not.toBeNull();
  });

  it("leaves checking state when the update IPC call rejects", async () => {
    const user = userEvent.setup();
    const checkForAppUpdate = vi
      .fn()
      .mockRejectedValue(new Error("Update transport unavailable"));
    stubSettingsApi({ checkForAppUpdate });

    renderSettings();
    await openCategory(user, "About");

    await waitFor(() => {
      expect(window.api.getAppUpdateStatus).toHaveBeenCalled();
    });
    const checkButton = screen.getByRole("button", { name: /Check now/i });
    await user.click(checkButton);

    await waitFor(() => {
      expect(screen.getByText(/v0\.1\.0 · Check failed/i)).toBeInTheDocument();
      expect(screen.getByText("Update transport unavailable")).toBeInTheDocument();
      expect(checkButton).toBeEnabled();
    });
  });
});
