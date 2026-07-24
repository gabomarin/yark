import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProviders } from "./app/AppProviders";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/radix-palette.css";
import "./styles/globals.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("No se encontró el elemento root");
}
createRoot(container).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
