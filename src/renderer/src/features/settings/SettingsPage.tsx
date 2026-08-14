import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Stack, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { SteamCmdCacheKind, SteamCmdStatus, ServerInstallationInfo, ServerProfile } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { SettingsAppDataSection } from "./components/SettingsAppDataSection";
import { SettingsAutoStartSection } from "./components/SettingsAutoStartSection";
import { SettingsGeneralSection } from "./components/SettingsGeneralSection";
import { SettingsLogRetentionSection } from "./components/SettingsLogRetentionSection";
import { SettingsNav } from "./components/SettingsNav";
import { SettingsServersSection } from "./components/SettingsServersSection";
import { SettingsSteamCmdSection } from "./components/SettingsSteamCmdSection";
import { SettingsYarkUpdateSection } from "./components/SettingsYarkUpdateSection";
import type { SettingsCategory, UiDensity } from "./settingsModel";
import type { DesktopShellPreferencesController } from "./useDesktopShellPreferences";
import classes from "./SettingsPage.module.css";

interface Props {
  appVersion: string;
  /** Open About (YARK updates) from the app-shell update icon. */
  focusYarkUpdates?: boolean;
  onYarkUpdatesFocused?: () => void;
  steamCmdStatus: SteamCmdStatus | null;
  servers: ServerProfile[];
  installationInfo: Map<string, ServerInstallationInfo>;
  onOpenServer: (serverId: string) => void;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  defaultBaseFolder: string | null;
  onDefaultBaseFolderChange: (path: string | null) => void;
  onPickSteamCmdPath: () => void;
  onInstallSteamCmd: () => void;
  onOpenSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  onClearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  steamCmdBusy?: boolean;
  onRunSetupAgain?: () => void;
  desktopShell: DesktopShellPreferencesController;
}

export function SettingsPage(props: Props): ReactElement {
  const desktopShell = props.desktopShell;
  const [category, setCategory] = useState<SettingsCategory>(() =>
    props.focusYarkUpdates === true ? "about" : "general",
  );
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const steamCmdNeedsSetup = props.steamCmdStatus?.detected !== true;

  useEffect(() => {
    if (props.focusYarkUpdates !== true) {
      return;
    }
    setCategory("about");
    props.onYarkUpdatesFocused?.();
  }, [props.focusYarkUpdates, props.onYarkUpdatesFocused]);

  useEffect(() => {
    if (panelScrollRef.current !== null) {
      panelScrollRef.current.scrollTop = 0;
    }
  }, [category]);

  const pickDefaultBaseFolder = async (): Promise<void> => {
    const current = props.defaultBaseFolder ?? undefined;
    const result = await window.api.pickPath(
      "directory",
      current,
      "Select default base folder for new servers",
    );
    if (!result.ok || result.data === null) {
      return;
    }
    props.onDefaultBaseFolderChange(result.data);
  };

  return (
    <PageScaffold
      title="Settings"
      subtitle="Preferences that apply to the whole app"
      fillViewport
    >
      <div className={classes.layout} data-settings-page>
        <AppSurfaceCard tone="chrome" fill padding="sm" className={classes.navCard}>
          <SettingsNav
            active={category}
            steamCmdNeedsSetup={steamCmdNeedsSetup}
            steamCmdBusy={props.steamCmdBusy === true}
            onChange={setCategory}
          />
        </AppSurfaceCard>

        <AppSurfaceCard fill className={classes.panel}>
          <div ref={panelScrollRef} className={classes.panelScroll} data-settings-panel-scroll>
            {category === "general" && (
              <SettingsGeneralSection
                uiDensity={props.uiDensity}
                onUiDensityChange={props.onUiDensityChange}
                closeWindowToTray={desktopShell.closeWindowToTray}
                onCloseWindowToTrayChange={desktopShell.onCloseWindowToTrayChange}
                trayCloseHintDismissed={desktopShell.trayCloseHintDismissed}
                onTrayCloseHintDismissedChange={desktopShell.onTrayCloseHintDismissedChange}
                startWithWindows={desktopShell.startWithWindows}
                onStartWithWindowsChange={desktopShell.onStartWithWindowsChange}
                desktopShellReady={desktopShell.desktopShellReady}
                onRunSetupAgain={props.onRunSetupAgain}
              />
            )}
            {category === "servers" && (
              <Stack gap="lg">
                <SettingsServersSection
                  openNativeTerminalOnStart={props.openNativeTerminalOnStart}
                  onOpenNativeTerminalOnStartChange={props.onOpenNativeTerminalOnStartChange}
                  defaultBaseFolder={props.defaultBaseFolder}
                  onDefaultBaseFolderChange={props.onDefaultBaseFolderChange}
                  onPickDefaultBaseFolder={() => void pickDefaultBaseFolder()}
                />
                <SettingsAutoStartSection
                  servers={props.servers}
                  installationInfo={props.installationInfo}
                  onOpenServer={props.onOpenServer}
                />
              </Stack>
            )}
            {category === "steamcmd" && (
              <SettingsSteamCmdSection
                steamCmdStatus={props.steamCmdStatus}
                steamCmdBusy={props.steamCmdBusy}
                onPickSteamCmdPath={props.onPickSteamCmdPath}
                onInstallSteamCmd={props.onInstallSteamCmd}
                onOpenSteamCmdCache={props.onOpenSteamCmdCache}
                onClearSteamCmdCache={props.onClearSteamCmdCache}
              />
            )}
            {category === "logs" && <SettingsLogRetentionSection />}
            {category === "about" && (
              <Stack gap="lg">
                <Title order={3} size="h4">
                  About
                </Title>
                <SettingsYarkUpdateSection
                  appVersion={props.appVersion}
                  focusSection={props.focusYarkUpdates === true}
                  onFocused={props.onYarkUpdatesFocused}
                />
                <SettingsAppDataSection
                  shellError={desktopShell.shellError}
                  onClearShellError={desktopShell.clearShellError}
                  steamCmdExecutablePath={props.steamCmdStatus?.executablePath ?? null}
                />
              </Stack>
            )}
          </div>
        </AppSurfaceCard>
      </div>
    </PageScaffold>
  );
}
