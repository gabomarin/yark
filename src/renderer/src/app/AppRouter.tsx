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
  error?: string | null;
  onDismissError?: () => void;
}

export function AppRouter(props: Props): JSX.Element {
  const content = (() => {
    switch (props.route) {
      case "overview":
        return props.overview?.page ?? (
          <PlaceholderPage
            title="Servidores"
            subtitle="Monitorea y administra todos tus servidores ARK"
          />
        );
      case "clusters":
        return (
          <PlaceholderPage
            title="Clústeres"
            subtitle="Compatibilidad y transferencias entre mapas"
          />
        );
      case "backups":
        return (
          <PlaceholderPage
            title="Respaldos"
            subtitle="Historial y restauración de respaldos"
          />
        );
      case "steamcmd":
        return props.steamcmd?.page ?? (
          <PlaceholderPage
            title="SteamCMD"
            subtitle="Estado de instalación, consola y operaciones"
          />
        );
      case "logs":
        return props.logs?.page ?? (
          <PlaceholderPage
            title="Registros"
            subtitle="Eventos, runtime, updates y backups por servidor"
          />
        );
      case "settings":
        return (
          <PlaceholderPage
            title="Configuración"
            subtitle="Configuración general de la aplicación"
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
