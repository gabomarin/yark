import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { MantineProvider } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { appCssVariablesResolver, appTheme } from "@theme/theme";

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  return (
    <MantineProvider
      theme={appTheme}
      cssVariablesResolver={appCssVariablesResolver}
      defaultColorScheme="dark"
    >
      <ModalsProvider
        modalProps={{ centered: true, radius: "md" }}
        labels={{ confirm: "Confirmar", cancel: "Cancelar" }}
      >
        <Notifications position="top-right" autoClose={5000} />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
