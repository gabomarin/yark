import { createTheme, type CSSVariablesResolver } from "@mantine/core";
import { appTokens } from "./tokens";

export const appCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--app-color-bg": appTokens.colors.bg,
    "--app-color-bg-accent": appTokens.colors.bgAccent,
    "--app-color-panel": appTokens.colors.panel,
    "--app-color-panel-alt": appTokens.colors.panelAlt,
    "--app-color-border": appTokens.colors.border,
    "--app-color-text": appTokens.colors.text,
    "--app-color-muted": appTokens.colors.muted,
    "--app-color-accent": appTokens.colors.accent,
    "--app-color-ok": appTokens.colors.ok,
    "--app-color-warn": appTokens.colors.warn,
    "--app-color-bad": appTokens.colors.bad,
    "--app-radius-sm": `${appTokens.radius.sm}px`,
    "--app-radius-md": `${appTokens.radius.md}px`,
    "--app-radius-lg": `${appTokens.radius.lg}px`,
    "--app-shadow-panel": appTokens.shadows.panel,
  },
  light: {},
  dark: {},
});

export const appTheme = createTheme({
  primaryColor: "blue",
  primaryShade: 5,
  fontFamily: '"Segoe UI", Arial, sans-serif',
  defaultRadius: "md",
  colors: {
    blue: [
      "#eef6ff",
      "#d9eaff",
      "#b7d7ff",
      "#8ec1ff",
      "#69acff",
      appTokens.colors.accent,
      "#3f8de0",
      "#2f6cab",
      "#1f4a75",
      "#10283f",
    ],
  },
  components: {
    AppShell: {
      defaultProps: {
        padding: 0,
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
      },
    },
  },
});
