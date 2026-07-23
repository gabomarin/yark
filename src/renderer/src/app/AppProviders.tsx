import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { PropsWithChildren } from "react";
import { appTheme } from "@theme/theme";

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  return (
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}