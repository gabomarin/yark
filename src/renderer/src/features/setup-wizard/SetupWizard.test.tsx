import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { SteamCmdStatus } from "@shared/types";
import { SetupWizard } from "./SetupWizard";

const steamCmdBusy: SteamCmdStatus = {
  detected: false,
  executablePath: null,
  depotCacheDir: null,
  contentCacheDir: null,
  busy: true,
  running: true,
  operation: "install-steamcmd",
  serverId: null,
  startedAt: "2026-08-14T00:00:00.000Z",
  pid: 1,
  progressPercent: 10,
  progressLabel: "Installing SteamCMD…",
  progressBytesDownloaded: null,
  progressBytesTotal: null,
  lastLine: null,
  queuedCount: 0,
  criticalJobs: [],
  checkedAt: "2026-08-14T00:00:00.000Z",
};

const desktopShell = {
  closeWindowToTray: true,
  startWithWindows: false,
  trayCloseHintDismissed: false,
  osNotifyEnabled: true,
  osNotifyCrash: true,
  osNotifySteamCmd: true,
  osNotifyYarkUpdate: true,
  desktopShellReady: true,
  onCloseWindowToTrayChange: vi.fn(),
  onStartWithWindowsChange: vi.fn(),
  onTrayCloseHintDismissedChange: vi.fn(),
  onOsNotifyEnabledChange: vi.fn(),
  onOsNotifyCrashChange: vi.fn(),
  onOsNotifySteamCmdChange: vi.fn(),
  onOsNotifyYarkUpdateChange: vi.fn(),
  shellError: null,
  clearShellError: vi.fn(),
};

function stubWizardApi(): void {
  vi.stubGlobal("api", {
    pickPath: vi.fn().mockResolvedValue({ ok: true, data: null }),
    getDesktopShellPreferences: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        closeWindowToTray: true,
        startWithWindows: false,
        trayCloseHintDismissed: false,
        osNotifyEnabled: true,
        osNotifyCrash: true,
        osNotifySteamCmd: true,
        osNotifyYarkUpdate: true,
      },
    }),
    setCloseWindowToTray: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setStartWithWindows: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setTrayCloseHintDismissed: vi.fn().mockResolvedValue({ ok: true, data: false }),
    setOsNotifyEnabled: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifyCrash: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifySteamCmd: vi.fn().mockResolvedValue({ ok: true, data: true }),
    setOsNotifyYarkUpdate: vi.fn().mockResolvedValue({ ok: true, data: true }),
  });
}

async function continueToFirstServer(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SetupWizard", () => {
  it("skips first-run setup from welcome", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={onSkip}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Welcome to YARK")).toBeInTheDocument();
    expect(
      screen.getByText(/server manager for ARK: Survival Ascended/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/save as you go/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip setup/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("does not skip when clicking the overlay", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={onSkip}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    const overlay = document.querySelector("[data-setup-wizard-overlay]");
    expect(overlay).toBeTruthy();
    await user.click(overlay!);
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.getByText("Welcome to YARK")).toBeInTheDocument();
  });

  it("does not skip first-run on Escape (#476)", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const onDismiss = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={onSkip}
          onDismiss={onDismiss}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByRole("dialog", { name: "Set up YARK" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onSkip).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Set up YARK" })).toBeInTheDocument();
  });

  it("lets Continue proceed on Paths while SteamCMD is busy", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={steamCmdBusy}
          steamCmdBusy
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Installing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /install steamcmd/i })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^choose/i })[0]).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Windows shell")).toBeInTheDocument();
    expect(screen.getByText("Show server console on start")).toBeInTheDocument();
  });

  it("toggles Show server console on start on the Windows step", async () => {
    const user = userEvent.setup();
    const onOpenNativeTerminalOnStartChange = vi.fn();
    const onStartWithWindowsChange = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="paths-shell"
          servers={[]}
          desktopShell={{ ...desktopShell, onStartWithWindowsChange }}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          openNativeTerminalOnStart={false}
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          onOpenNativeTerminalOnStartChange={onOpenNativeTerminalOnStartChange}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(
      screen.getByRole("switch", {
        name: /Show native console when a server starts/i,
      }),
    );
    expect(onOpenNativeTerminalOnStartChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("switch", { name: /start yark with windows/i }));
    expect(onStartWithWindowsChange).toHaveBeenCalledWith(true);
  });

  it("continues past Cluster when Cross-ARK is No", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Share transfers between maps?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /cluster id/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /yes/i }));
    expect(screen.getByRole("textbox", { name: /cluster id/i })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /not now/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByRole("button", { name: /new server/i })).toBeInTheDocument();
  });

  it("suggests a cluster directory from the default base folder", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={"D:\\ASA\\Servers"}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("radio", { name: /yes/i }));

    const clusterId = screen.getByRole("textbox", { name: /cluster id/i });
    const clusterDir = screen.getByRole("textbox", {
      name: /shared cluster directory/i,
    });
    const initialId = (clusterId as HTMLInputElement).value;
    expect(clusterDir).toHaveAttribute(
      "title",
      `D:\\ASA\\Servers\\Clusters\\${initialId}`,
    );
    expect(screen.getByText(/suggested from your default base folder/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate/i }));
    const generatedId = (clusterId as HTMLInputElement).value;
    expect(generatedId).not.toBe(initialId);
    expect(clusterDir).toHaveAttribute(
      "title",
      `D:\\ASA\\Servers\\Clusters\\${generatedId}`,
    );
  });

  it("hands off first-action New server", async () => {
    const user = userEvent.setup();
    const onCreateServer = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={onCreateServer}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await continueToFirstServer(user);
    expect(screen.getByText(/create a server profile/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /new server/i }));
    expect(onCreateServer).toHaveBeenCalledWith(null);
  });

  it("returns from First server with Back", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await continueToFirstServer(user);
    expect(screen.getByRole("button", { name: /new server/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^continue$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByText("Share transfers between maps?")).toBeInTheDocument();
  });

  it("uses Paths + Windows resume mode from Settings", async () => {
    const user = userEvent.setup();
    const onPathsShellDone = vi.fn();
    const onDismiss = vi.fn();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="paths-shell"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={steamCmdBusy}
          steamCmdBusy
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={onDismiss}
          onPathsShellDone={onPathsShellDone}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    expect(
      screen.getByText("Setup assistant – paths and Windows"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Welcome to YARK")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^finish$/i }));
    expect(onPathsShellDone).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the cluster directory error when Yes has no default base folder", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={null}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("radio", { name: /yes/i }));

    expect(screen.getByText("Cluster directory is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });

  it("refreshes the suggested cluster folder when the default base folder changes", async () => {
    const user = userEvent.setup();
    stubWizardApi();

    const { rerender } = render(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={"D:\\ASA\\Servers"}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await user.click(screen.getByRole("radio", { name: /yes/i }));

    const clusterId = screen.getByRole("textbox", { name: /cluster id/i });
    const clusterDir = screen.getByRole("textbox", {
      name: /shared cluster directory/i,
    });
    const id = (clusterId as HTMLInputElement).value;
    expect(clusterDir).toHaveAttribute("title", `D:\\ASA\\Servers\\Clusters\\${id}`);

    rerender(
      <AppProviders>
        <SetupWizard
          opened
          mode="first-run"
          servers={[]}
          desktopShell={desktopShell}
          busy={false}
          steamCmdStatus={null}
          steamCmdBusy={false}
          defaultBaseFolder={"E:\\ARK"}
          uiDensity="compact"
          onPickSteamCmdPath={vi.fn()}
          onInstallSteamCmd={vi.fn()}
          onDefaultBaseFolderChange={vi.fn()}
          onUiDensityChange={vi.fn()}
          openNativeTerminalOnStart={false}
          onOpenNativeTerminalOnStartChange={vi.fn()}
          onSkip={vi.fn()}
          onDismiss={vi.fn()}
          onPathsShellDone={vi.fn()}
          onCreateServer={vi.fn()}
          onImport={vi.fn()}
          onExplore={vi.fn()}
        />
      </AppProviders>,
    );

    expect(clusterDir).toHaveAttribute("title", `E:\\ARK\\Clusters\\${id}`);
  });
});
