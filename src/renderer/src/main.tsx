import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadUiDensityPref } from "@features/settings/settingsModel";
import { DEFAULT_UI_DENSITY } from "@shared/ui-density";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";
import "mantine-datatable/styles.css";
import "./styles/radix-palette.css";
import "./styles/globals.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element not found");
}

void (async () => {
  let initialUiDensity = DEFAULT_UI_DENSITY;
  try {
    initialUiDensity = await loadUiDensityPref();
  } catch {
    initialUiDensity = DEFAULT_UI_DENSITY;
  }

  createRoot(container).render(
    <React.StrictMode>
      <App initialUiDensity={initialUiDensity} />
    </React.StrictMode>,
  );
})();
