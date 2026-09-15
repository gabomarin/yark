import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "@ui/AppErrorBoundary/AppErrorBoundary";
import {
  loadOpenNativeConsolePref,
  loadUiDensityPref,
} from "@features/settings/settingsModel";
import { DEFAULT_OPEN_NATIVE_CONSOLE } from "@shared/open-native-console";
import { DEFAULT_UI_DENSITY } from "@shared/ui-density";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/carousel/styles.css";
import "@mantine/notifications/styles.layer.css";
import "@mantine/spotlight/styles.layer.css";
import "mantine-datatable/styles.layer.css";
import "./styles/radix-palette.css";
import "./styles/globals.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element not found");
}

void (async () => {
  let initialUiDensity = DEFAULT_UI_DENSITY;
  let initialOpenNativeConsole = DEFAULT_OPEN_NATIVE_CONSOLE;
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

  createRoot(container).render(
    <React.StrictMode>
      {/* Outside App/Mantine so a provider throw still shows Reload chrome. */}
      <AppErrorBoundary>
        <App
          initialUiDensity={initialUiDensity}
          initialOpenNativeConsole={initialOpenNativeConsole}
        />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
})();
