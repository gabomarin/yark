import { AppShell } from "@mantine/core";
import { Alert, CloseButton, Group, Stack } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import { Sidebar, type Route } from "@layout/Sidebar/Sidebar";
import { useSidebarRail } from "@layout/useSidebarRail";
import {
  AppBusyOverlay,
  type AppBusyOverlayContent,
} from "@ui/AppBusyOverlay/AppBusyOverlay";
import { ChromeRailEdgeToggle } from "@ui/ChromeRailEdgeToggle/ChromeRailEdgeToggle";
import type { OfficialNetworkStatus } from "@shared/types";
import type { PropsWithChildren, ReactElement } from "react";
import classes from "./AppShellLayout.module.css";

interface Props extends PropsWithChildren {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  appVersion: string;
  yarkUpdateAvailableVersion?: string | null;
  onYarkUpdateClick?: () => void;
  error?: string | null;
  onDismissError?: () => void;
  /** Blocks shell chrome while stop/save/backup (or similar) runs. */
  busyOverlay?: AppBusyOverlayContent | null;
}

export function AppShellLayout({ children, ...sidebarProps }: Props): ReactElement {
  const {
    error = null,
    onDismissError,
    busyOverlay = null,
    ...shellProps
  } = sidebarProps;
  const density = useUiDensity();
  const fullNavbarWidth = density === "compact" ? 212 : 248;
  const sidebarRail = useSidebarRail(fullNavbarWidth);

  return (
    <AppShell
      navbar={{ width: sidebarRail.railWidthPx, breakpoint: "sm" }}
      padding={0}
      className={classes.shell}
      classNames={{
        navbar: classes.navbar,
        main: classes.main,
      }}
    >
      <AppShell.Navbar>
        <Sidebar {...shellProps} iconMode={sidebarRail.iconMode} />
        <ChromeRailEdgeToggle
          className={classes.sidebarEdgeToggle}
          style={{ left: sidebarRail.railWidthPx }}
          iconMode={sidebarRail.iconMode}
          onToggle={sidebarRail.toggleRail}
          expandLabel="Expand navigation"
          collapseLabel="Collapse to icon rail"
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap={0} className={classes.content}>
          {error !== null && (
            <Alert
              color="red"
              radius={0}
              variant="light"
              title="Error"
              role="alert"
              withCloseButton={false}
            >
              <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                <span>{error}</span>
                {onDismissError !== undefined && (
                  <CloseButton aria-label="Dismiss error" onClick={onDismissError} />
                )}
              </Group>
            </Alert>
          )}
          {children}
        </Stack>
      </AppShell.Main>
      {busyOverlay !== null && <AppBusyOverlay content={busyOverlay} />}
    </AppShell>
  );
}
