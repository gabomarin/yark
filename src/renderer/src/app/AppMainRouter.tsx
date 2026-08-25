import type { ReactElement } from "react";
import { AppFormOverlays } from "@app/AppFormOverlays";
import { AppRouterPages } from "@app/AppRouterPages";
import { AppWorkspaceOverlay } from "@app/AppWorkspaceOverlay";
import type { AppShellChromeProps } from "@app/appShellChrome";
import type {
  AppFleetSlice,
  AppLifecycleSlice,
  AppNavigationSlice,
  AppOverviewSlice,
  AppRconSlice,
  AppSettingsSlice,
  AppShellChromeInputs,
  AppSteamCmdSlice,
} from "@app/model/appMainRouterSlices";

export interface AppMainRouterProps {
  navigation: AppNavigationSlice;
  fleet: AppFleetSlice;
  lifecycle: AppLifecycleSlice;
  rcon: AppRconSlice;
  steamCmd: AppSteamCmdSlice;
  overview: AppOverviewSlice;
  settings: AppSettingsSlice;
  chrome: AppShellChromeInputs;
}

function buildShellChrome(
  navigation: AppNavigationSlice,
  steamCmd: AppSteamCmdSlice,
  chrome: AppShellChromeInputs,
): AppShellChromeProps {
  return {
    navigate: navigation.navigate,
    steamCmdDetected: steamCmd.steamCmdStatus?.detected === true,
    steamCmdRunning: steamCmd.steamCmdBusy,
    officialVersion: chrome.officialVersion,
    officialNetworkStatus: chrome.officialNetworkStatus,
    yarkUpdateAvailableVersion: chrome.yarkUpdateAvailableVersion,
    onWhatsNewClick: chrome.onWhatsNewClick,
    onYarkUpdateClick: chrome.onYarkUpdateClick,
    busyOverlay: chrome.stopBusyOverlay,
    downloadCount: chrome.downloadCount,
    workspaceFooter: chrome.downloadsWorkspaceFooter,
  };
}

export function AppMainRouter(props: AppMainRouterProps): ReactElement {
  const { navigation, fleet, lifecycle, rcon, steamCmd, overview, settings, chrome } =
    props;
  const shell = buildShellChrome(navigation, steamCmd, chrome);

  if (navigation.overlay?.kind === "workspace") {
    return (
      <AppWorkspaceOverlay
        shell={shell}
        overlay={navigation.overlay}
        setOverlay={navigation.setOverlay}
        fleet={fleet}
        lifecycle={lifecycle}
        rcon={rcon}
        steamCmd={steamCmd}
        registerOverlayLeaveGuard={navigation.registerOverlayLeaveGuard}
        onStatusPanelVisibleChange={navigation.onWorkspaceStatusPanelVisibleChange}
      />
    );
  }

  if (navigation.overlay?.kind === "create" || navigation.overlay?.kind === "edit") {
    return (
      <AppFormOverlays
        shell={shell}
        overlay={navigation.overlay}
        setOverlay={navigation.setOverlay}
        navigate={navigation.navigate}
        fleet={fleet}
        settings={settings}
        registerOverlayLeaveGuard={navigation.registerOverlayLeaveGuard}
        runWithOverlayLeaveGuard={navigation.runWithOverlayLeaveGuard}
        consumePendingSetupCluster={navigation.consumePendingSetupCluster}
      />
    );
  }

  return (
    <AppRouterPages
      shell={shell}
      route={navigation.route}
      setOverlay={navigation.setOverlay}
      fleet={fleet}
      lifecycle={lifecycle}
      rcon={rcon}
      steamCmd={steamCmd}
      overview={overview}
      settings={settings}
    />
  );
}
