import { PlaceholderPage } from "@ui/PlaceholderPage/PlaceholderPage";
import { AppShellLayout } from "./AppShellLayout";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ReactNode } from "react";

interface OverviewSlot {
  page: ReactNode;
}

interface SteamCmdSlot {
  page: ReactNode;
}

interface LogsSlot {
  page: ReactNode;
}

interface BackupsSlot {
  page: ReactNode;
}

interface Props {
  route: Route;
  appVersion: string;
  officialVersion: string | null;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  onNavigate: (route: Route) => void;
  overview: OverviewSlot | null;
  steamcmd: SteamCmdSlot | null;
  logs: LogsSlot | null;
  backups: BackupsSlot | null;
  error?: string | null;
  onDismissError?: () => void;
}

export function AppRouter(props: Props): JSX.Element {
  const content = (() => {
    switch (props.route) {
      case "overview":
        return props.overview?.page ?? (
          <PlaceholderPage
            title="Servers"
            subtitle="Monitor and manage all your ARK servers"
          />
        );
      case "clusters":
        return (
          <PlaceholderPage
            title="Clusters"
            subtitle="Compatibility and cross-map transfers"
          />
        );
      case "backups":
        return props.backups?.page ?? (
          <PlaceholderPage
            title="Backups"
            subtitle="Backup history and restore"
          />
        );
      case "steamcmd":
        return props.steamcmd?.page ?? (
          <PlaceholderPage
            title="SteamCMD"
            subtitle="Install status, console, and operations"
          />
        );
      case "logs":
        return props.logs?.page ?? (
          <PlaceholderPage
            title="Logs"
            subtitle="Events, runtime, updates, and backups per server"
          />
        );
      case "settings":
        return (
          <PlaceholderPage
            title="Settings"
            subtitle="General application settings"
          />
        );
      default:
        return null;
    }
  })();

  return (
    <AppShellLayout
      route={props.route}
      onNavigate={props.onNavigate}
      steamCmdDetected={props.steamCmdDetected}
      steamCmdRunning={props.steamCmdRunning}
      officialVersion={props.officialVersion}
      appVersion={props.appVersion}
      openNativeTerminalOnStart={props.openNativeTerminalOnStart}
      onOpenNativeTerminalOnStartChange={props.onOpenNativeTerminalOnStartChange}
      error={props.error}
      onDismissError={props.onDismissError}
    >
      {content}
    </AppShellLayout>
  );
}
