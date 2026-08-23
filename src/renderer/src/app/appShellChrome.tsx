import { APP_VERSION } from "@shared/app-version";
import type { OfficialNetworkStatus } from "@shared/types";
import type { ReactElement, ReactNode } from "react";
import { AppShellLayout } from "@app/AppShellLayout";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { AppBusyOverlayContent } from "@ui/AppBusyOverlay/AppBusyOverlay";

export interface AppShellChromeProps {
  navigate: (next: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  yarkUpdateAvailableVersion: string | null;
  onWhatsNewClick: () => void;
  onYarkUpdateClick: () => void;
  busyOverlay: AppBusyOverlayContent | null;
  downloadCount: number;
  workspaceFooter: ReactNode;
}

export function AppShellWithChrome(props: {
  shell: AppShellChromeProps;
  children: ReactNode;
}): ReactElement {
  const { shell, children } = props;
  return (
    <AppShellLayout
      route="overview"
      onNavigate={shell.navigate}
      steamCmdDetected={shell.steamCmdDetected}
      steamCmdRunning={shell.steamCmdRunning}
      officialVersion={shell.officialVersion}
      officialNetworkStatus={shell.officialNetworkStatus}
      appVersion={APP_VERSION}
      yarkUpdateAvailableVersion={shell.yarkUpdateAvailableVersion}
      onWhatsNewClick={shell.onWhatsNewClick}
      onYarkUpdateClick={shell.onYarkUpdateClick}
      busyOverlay={shell.busyOverlay}
      downloadCount={shell.downloadCount}
      workspaceFooter={shell.workspaceFooter}
    >
      {children}
    </AppShellLayout>
  );
}
