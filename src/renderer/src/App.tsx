import type { ReactElement } from "react";
import { DEFAULT_OPEN_NATIVE_CONSOLE } from "@shared/settings/open-native-console";
import { AppShell, type AppShellProps } from "@app/AppShell";

export type AppProps = AppShellProps;

/** Renderer entry: initial prefs from `main.tsx`, shell composition in `AppShell`. */
export function App({
  initialUiDensity = "compact",
  initialOpenNativeConsole = DEFAULT_OPEN_NATIVE_CONSOLE,
  initialThemeId,
}: AppProps): ReactElement {
  return (
    <AppShell
      initialUiDensity={initialUiDensity}
      initialOpenNativeConsole={initialOpenNativeConsole}
      initialThemeId={initialThemeId}
    />
  );
}
