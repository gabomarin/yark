import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "@ui/AppErrorBoundary/AppErrorBoundary";
import { loadAppearancePref, loadOpenNativeConsolePref, loadUiDensityPref } from "@features/settings/settingsModel";
import { DEFAULT_APPEARANCE_SETTINGS } from "@shared/settings/appearance";
import { DEFAULT_OPEN_NATIVE_CONSOLE } from "@shared/settings/open-native-console";
import { DEFAULT_UI_DENSITY } from "@shared/settings/ui-density";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/carousel/styles.css";
import "@mantine/notifications/styles.layer.css";
import "@mantine/spotlight/styles.layer.css";
import "mantine-datatable/styles.layer.css";
import "./styles/globals.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element not found");
}

void (async () => {
  let initialUiDensity = DEFAULT_UI_DENSITY;
  let initialOpenNativeConsole = DEFAULT_OPEN_NATIVE_CONSOLE;
  let initialThemeId = DEFAULT_APPEARANCE_SETTINGS.theme;
  try {
    initialUiDensity = await loadUiDensityPref();
  } catch {
    initialUiDensity = DEFAULT_UI_DENSITY;
  }
  try {
    initialOpenNativeConsole = await loadOpenNativeConsolePref();
  } catch {
    initialOpenNativeConsole = DEFAULT_OPEN_NATIVE_CONSOLE;
  }
  try {
    initialThemeId = (await loadAppearancePref()).theme;
  } catch {
    initialThemeId = DEFAULT_APPEARANCE_SETTINGS.theme;
  }

  createRoot(container).render(
    <React.StrictMode>
      {/* Outside App/Mantine so a provider throw still shows Reload chrome. */}
      <AppErrorBoundary>
        <App
          initialUiDensity={initialUiDensity}
          initialOpenNativeConsole={initialOpenNativeConsole}
          initialThemeId={initialThemeId}
        />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
})();
