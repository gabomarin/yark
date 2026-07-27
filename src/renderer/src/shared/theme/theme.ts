import { createTheme, type CSSVariablesResolver } from "@mantine/core";
import { appTokens, radixPalette } from "./tokens";

const radixCssVariables = Object.fromEntries([
  ...radixPalette.blue.map((value, index) => [`--ark-blue-${index + 1}`, value]),
  ...radixPalette.blueAlpha.map((value, index) => [`--ark-blue-a${index + 1}`, value]),
  ...radixPalette.gray.map((value, index) => [`--ark-gray-${index + 1}`, value]),
  ...radixPalette.grayAlpha.map((value, index) => [`--ark-gray-a${index + 1}`, value]),
  ["--ark-blue-contrast", "#ffffff"],
  ["--ark-blue-surface", "#01145180"],
  ["--ark-blue-indicator", radixPalette.blue[8]],
  ["--ark-blue-track", radixPalette.blue[8]],
  ["--ark-gray-contrast", "#ffffff"],
  ["--ark-gray-surface", "rgba(0, 0, 0, 0.05)"],
  ["--ark-gray-indicator", radixPalette.gray[8]],
  ["--ark-gray-track", radixPalette.gray[8]],
  ["--ark-background", radixPalette.background],
]);

export const appCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    ...radixCssVariables,
    "--app-color-bg": "var(--ark-background)",
    "--app-color-surface-chrome":
      "color-mix(in srgb, var(--ark-gray-2) 88%, var(--ark-blue-2))",
    "--app-color-surface-panel":
      "color-mix(in srgb, var(--ark-gray-3) 86%, var(--ark-blue-2))",
    "--app-color-surface-control":
      "color-mix(in srgb, var(--ark-gray-5) 72%, var(--ark-blue-3))",
    "--app-color-surface-control-hover":
      "color-mix(in srgb, var(--ark-gray-5) 64%, var(--ark-blue-4))",
    "--app-color-border-subtle":
      "color-mix(in srgb, var(--ark-gray-6) 82%, var(--ark-blue-7))",
    "--app-color-border-control":
      "color-mix(in srgb, var(--ark-gray-9) 72%, var(--ark-blue-8))",
    "--app-color-text-soft":
      "color-mix(in srgb, var(--ark-gray-12) 88%, var(--ark-gray-11))",
    "--app-color-muted-soft":
      "color-mix(in srgb, var(--ark-gray-11) 88%, var(--ark-gray-10))",
    "--app-color-bg-accent": "var(--app-color-surface-chrome)",
    "--app-color-panel": "var(--app-color-surface-panel)",
    "--app-color-panel-alt": "var(--app-color-surface-control)",
    "--app-color-panel-cool":
      "color-mix(in srgb, var(--ark-gray-3) 84%, var(--ark-blue-2))",
    "--app-color-panel-cool-emphasis":
      "color-mix(in srgb, var(--ark-gray-3) 72%, var(--ark-blue-3))",
    "--app-color-border": "var(--app-color-border-subtle)",
    "--app-color-text": "var(--app-color-text-soft)",
    "--app-color-muted": "var(--app-color-muted-soft)",
    "--app-color-accent": "var(--ark-blue-9)",
    "--app-color-ok": appTokens.colors.ok,
    "--app-color-warn": appTokens.colors.warn,
    "--app-color-bad": appTokens.colors.bad,
    "--app-color-danger": "var(--app-color-bad)",
    "--app-color-cryo": "var(--ark-blue-11)",
    "--app-color-biomass": appTokens.colors.biomass,
    "--app-color-fossil": appTokens.colors.fossil,
    "--app-radius-sm": `${appTokens.radius.sm}px`,
    "--app-radius-md": `${appTokens.radius.md}px`,
    "--app-radius-lg": `${appTokens.radius.lg}px`,
    "--app-radius-control": `${appTokens.radius.control}px`,
    "--app-space-xxs": `${appTokens.spacing.xxs}px`,
    "--app-space-xs": `${appTokens.spacing.xs}px`,
    "--app-space-sm": `${appTokens.spacing.sm}px`,
    "--app-space-md": `${appTokens.spacing.md}px`,
    "--app-space-lg": `${appTokens.spacing.lg}px`,
    "--app-space-xl": `${appTokens.spacing.xl}px`,
    "--app-shadow-panel": appTokens.shadows.panel,
    "--app-shadow-elevated": "0 18px 36px rgba(0, 0, 0, 0.32)",
    /* Shared surface recipes — prefer AppSurfaceCard / these vars over copy-pasted gradients */
    "--app-surface-border":
      "color-mix(in srgb, var(--app-color-border) 72%, var(--ark-blue-7))",
    "--app-surface-cool":
      "linear-gradient(112deg, color-mix(in srgb, var(--app-color-panel-cool-emphasis) 48%, var(--app-color-panel-cool)) 0%, var(--app-color-panel-cool) 44%, color-mix(in srgb, var(--app-color-panel-cool) 82%, var(--app-color-panel)) 100%)",
    "--app-surface-cool-emphasis":
      "linear-gradient(108deg, var(--app-color-panel-cool-emphasis) 0%, var(--app-color-panel-cool) 52%, color-mix(in srgb, var(--app-color-panel-cool) 76%, var(--app-color-panel)) 100%)",
    "--app-surface-flat": "var(--app-color-panel)",
    "--app-surface-chrome": "var(--app-color-surface-chrome)",
    "--app-list-selected-bg":
      "linear-gradient(90deg, color-mix(in srgb, var(--ark-gray-4) 70%, var(--ark-blue-4)) 0%, color-mix(in srgb, var(--ark-gray-3) 82%, var(--ark-blue-3)) 100%)",
    "--app-list-selected-inset": "inset 3px 0 0 var(--ark-blue-9)",
  },
  light: {},
  dark: {
    "--mantine-color-body": "var(--ark-background)",
    "--mantine-color-text": "var(--app-color-text)",
    "--mantine-color-dimmed": "var(--app-color-muted)",
    "--mantine-color-dark-0": "var(--app-color-text)",
    "--mantine-color-dark-1": "var(--app-color-muted)",
    "--mantine-color-dark-2": "var(--ark-gray-10)",
    "--mantine-color-dark-3": "var(--ark-gray-8)",
    "--mantine-color-dark-4": "var(--ark-gray-7)",
    "--mantine-color-dark-5": "var(--ark-gray-6)",
    "--mantine-color-dark-6": "var(--ark-gray-4)",
    "--mantine-color-dark-7": "var(--ark-gray-3)",
    "--mantine-color-dark-8": "var(--ark-gray-2)",
    "--mantine-color-dark-9": "var(--ark-gray-1)",
    "--mantine-color-blue-0": "var(--ark-blue-12)",
    "--mantine-color-blue-1": "var(--ark-blue-11)",
    "--mantine-color-blue-2": "var(--ark-blue-8)",
    "--mantine-color-blue-3": "var(--ark-blue-7)",
    "--mantine-color-blue-4": "var(--ark-blue-6)",
    "--mantine-color-blue-5": "var(--ark-blue-9)",
    "--mantine-color-blue-6": "var(--ark-blue-10)",
    "--mantine-color-blue-7": "var(--ark-blue-5)",
    "--mantine-color-blue-8": "var(--ark-blue-3)",
    "--mantine-color-blue-9": "var(--ark-blue-1)",
    "--mantine-primary-color-filled": "var(--ark-blue-9)",
    "--mantine-primary-color-filled-hover": "var(--ark-blue-10)",
    "--mantine-primary-color-light": "var(--ark-blue-a3)",
    "--mantine-primary-color-light-hover": "var(--ark-blue-a4)",
    "--mantine-primary-color-light-color": "var(--ark-blue-11)",
    "--mantine-color-blue-filled": "var(--ark-blue-9)",
    "--mantine-color-blue-filled-hover": "var(--ark-blue-10)",
    "--mantine-color-blue-light": "var(--ark-blue-a3)",
    "--mantine-color-blue-light-hover": "var(--ark-blue-a4)",
    "--mantine-color-blue-light-color": "var(--ark-blue-11)",
  },
});

export const appTheme = createTheme({
  primaryColor: "blue",
  primaryShade: 5,
  fontFamily: '"Segoe UI", Arial, sans-serif',
  defaultRadius: "md",
  /** Aligns `gap="xs"|…` / `p="md"` with `--app-space-*` (overrides Mantine defaults). */
  spacing: {
    xxs: `${appTokens.spacing.xxs}px`,
    xs: `${appTokens.spacing.xs}px`,
    sm: `${appTokens.spacing.sm}px`,
    md: `${appTokens.spacing.md}px`,
    lg: `${appTokens.spacing.lg}px`,
    xl: `${appTokens.spacing.xl}px`,
  },
  radius: {
    sm: `${appTokens.radius.sm}px`,
    md: `${appTokens.radius.md}px`,
    lg: `${appTokens.radius.lg}px`,
  },
  colors: {
    blue: [
      radixPalette.blue[11],
      radixPalette.blue[10],
      radixPalette.blue[7],
      radixPalette.blue[6],
      radixPalette.blue[5],
      radixPalette.blue[8],
      radixPalette.blue[9],
      radixPalette.blue[4],
      radixPalette.blue[2],
      radixPalette.blue[0],
    ],
    dark: [
      radixPalette.gray[11],
      radixPalette.gray[10],
      radixPalette.gray[9],
      radixPalette.gray[7],
      radixPalette.gray[6],
      radixPalette.gray[5],
      radixPalette.gray[3],
      radixPalette.gray[2],
      radixPalette.gray[1],
      radixPalette.gray[0],
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
        withBorder: true,
        radius: "lg",
        padding: "md",
      },
    },
    Paper: {
      defaultProps: {
        radius: "md",
      },
    },
  },
});
