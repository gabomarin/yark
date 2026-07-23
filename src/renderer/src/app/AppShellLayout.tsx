import { AppShell } from "@mantine/core";
import { Alert, CloseButton, Group, Stack } from "@mantine/core";
import { Sidebar, type Route } from "@layout/Sidebar/Sidebar";
import type { PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  appVersion: string;
  error?: string | null;
  onDismissError?: () => void;
}

export function AppShellLayout({ children, ...sidebarProps }: Props): JSX.Element {
  const { error = null, onDismissError, ...shellProps } = sidebarProps;
  return (
    <AppShell
      navbar={{ width: 248, breakpoint: "sm" }}
      padding={0}
      styles={{
        main: {
          minHeight: "100vh",
          background: "transparent",
        },
      }}
    >
      <AppShell.Navbar>
        <Sidebar {...shellProps} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap={0}>
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
                  <CloseButton aria-label="Cerrar error" onClick={onDismissError} />
                )}
              </Group>
            </Alert>
          )}
          {children}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}