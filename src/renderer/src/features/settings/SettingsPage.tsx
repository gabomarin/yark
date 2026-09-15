import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Stack, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type { SteamCmdCacheKind, SteamCmdStatus, ServerInstallationInfo, ServerProfile } from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { SettingsAboutCommunitySection } from "./components/SettingsAboutCommunitySection";
import { SettingsAboutLegalSection } from "./components/SettingsAboutLegalSection";
import { SettingsAppDataSection } from "./components/SettingsAppDataSection";
import { SettingsAutoStartSection } from "./components/SettingsAutoStartSection";
import { SettingsGeneralSection } from "./components/SettingsGeneralSection";
import { SettingsLogRetentionSection } from "./components/SettingsLogRetentionSection";
import { SettingsNav } from "./components/SettingsNav";
import { SettingsServersSection } from "./components/SettingsServersSection";
import { SettingsSteamCmdSection } from "./components/SettingsSteamCmdSection";
import { SettingsDiscordSection } from "./components/SettingsDiscordSection";
import { SettingsYarkUpdateSection } from "./components/SettingsYarkUpdateSection";
import {
  readSettingsCategoryPref,
  writeSettingsCategoryPref,
  type SettingsCategory,
  type UiDensity,
} from "./settingsModel";
import type { DesktopShellPreferencesController } from "./hooks/useDesktopShellPreferences";
import { SETTINGS_PANEL_SCROLL_ATTR } from "./settingsTestIds";
import classes from "./SettingsPage.module.css";

interface Props {
  appVersion: string;
  /** Open About (YARK updates) from the app-shell update icon. */
  focusYarkUpdates?: boolean;
  onYarkUpdatesFocused?: () => void;
  /** Open the SteamCMD category (Downloads missing-SteamCMD CTA). */
  focusSteamCmd?: boolean;
  onSteamCmdFocused?: () => void;
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
  /**
   * Bumped when the setup wizard closes so Settings returns to General
   * (unless a SteamCMD / About deep link is active).
   */
  landOnGeneralToken?: number;
}

export function SettingsPage(props: Props): ReactElement {
  const {
    focusYarkUpdates,
    onYarkUpdatesFocused,
    focusSteamCmd,
    onSteamCmdFocused,
    landOnGeneralToken = 0,
  } = props;
  const desktopShell = props.desktopShell;
  const [category, setCategory] = useState<SettingsCategory>(() =>
    props.focusYarkUpdates === true
      ? "about"
      : props.focusSteamCmd === true
        ? "steamcmd"
        : (readSettingsCategoryPref() ?? "general"),
  );
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const seenLandOnGeneralToken = useRef(landOnGeneralToken);

  useEffect(() => {
    writeSettingsCategoryPref(category);
  }, [category]);

  useEffect(() => {
    if (landOnGeneralToken === seenLandOnGeneralToken.current) {
      return;
    }
    seenLandOnGeneralToken.current = landOnGeneralToken;
    if (focusYarkUpdates === true || focusSteamCmd === true) {
      return;
    }
    setCategory("general");
  }, [landOnGeneralToken, focusYarkUpdates, focusSteamCmd]);

  useEffect(() => {
    if (focusYarkUpdates !== true) {
      return;
    }
    setCategory("about");
    onYarkUpdatesFocused?.();
  }, [focusYarkUpdates, onYarkUpdatesFocused]);

  useEffect(() => {
    if (focusYarkUpdates === true || focusSteamCmd !== true) {
      return;
    }
    setCategory("steamcmd");
    onSteamCmdFocused?.();
  }, [focusSteamCmd, focusYarkUpdates, onSteamCmdFocused]);

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
      fillViewport
      edgeToEdge
      showHeader={false}
    >
      <div className={classes.layout} data-settings-page>
        <AppSurfaceCard
          tone="chrome"
          fill
          radius={0}
          padding="sm"
          className={classes.navCard}
        >
          <div className={classes.navPane}>
            <h1 className={classes.navTitle}>Settings</h1>
            <SettingsNav
              active={category}
              onChange={setCategory}
            />
          </div>
        </AppSurfaceCard>

        <div className={classes.panel}>
          <div
            ref={panelScrollRef}
            className={classes.panelScroll}
            {...{ [SETTINGS_PANEL_SCROLL_ATTR]: true }}
          >
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
                osNotifyEnabled={desktopShell.osNotifyEnabled}
                onOsNotifyEnabledChange={desktopShell.onOsNotifyEnabledChange}
                osNotifyCrash={desktopShell.osNotifyCrash}
                onOsNotifyCrashChange={desktopShell.onOsNotifyCrashChange}
                osNotifySteamCmd={desktopShell.osNotifySteamCmd}
                onOsNotifySteamCmdChange={desktopShell.onOsNotifySteamCmdChange}
                osNotifyYarkUpdate={desktopShell.osNotifyYarkUpdate}
                onOsNotifyYarkUpdateChange={desktopShell.onOsNotifyYarkUpdateChange}
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
            {category === "discord" && <SettingsDiscordSection />}
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
                <SettingsAboutCommunitySection />
                <SettingsAboutLegalSection />
              </Stack>
            )}
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
