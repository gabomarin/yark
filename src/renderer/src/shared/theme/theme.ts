import { createTheme, type CSSVariablesResolver, type MantineThemeOverride } from "@mantine/core";
import {
  appTokens as defaultAppTokens,
  radixPalette,
  type AppTokens,
  type UiDensity,
  getAppTokens,
} from "./tokens";

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
  ["--ark-blue-ini-category", radixPalette.iniCategory],
]);

export function createAppCssVariablesResolver(
  tokens: AppTokens = defaultAppTokens,
): CSSVariablesResolver {
  return () => ({
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
      "--app-color-ini-category": "var(--ark-blue-ini-category)",
      "--app-color-ok": tokens.colors.ok,
      "--app-color-warn": tokens.colors.warn,
      "--app-color-attention": tokens.colors.attention,
      "--app-color-bad": tokens.colors.bad,
      "--app-color-danger": "var(--app-color-bad)",
      "--app-color-cryo": "var(--ark-blue-11)",
      "--app-color-biomass": tokens.colors.biomass,
      "--app-color-fossil": tokens.colors.fossil,
      "--app-radius-sm": `${tokens.radius.sm}px`,
      "--app-radius-md": `${tokens.radius.md}px`,
      "--app-radius-lg": `${tokens.radius.lg}px`,
      "--app-radius-control": `${tokens.radius.control}px`,
      "--app-space-xxs": `${tokens.spacing.xxs}px`,
      "--app-space-xs": `${tokens.spacing.xs}px`,
      "--app-space-sm": `${tokens.spacing.sm}px`,
      "--app-space-md": `${tokens.spacing.md}px`,
      "--app-space-lg": `${tokens.spacing.lg}px`,
      "--app-space-xl": `${tokens.spacing.xl}px`,
      "--app-font-page": `${tokens.pageTitle}px`,
      "--app-shadow-panel": tokens.shadows.panel,
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
      /* Mantine dark default maps blue-text → blue-4; filled buttons use blue-filled (= ark-blue-9). */
      "--mantine-color-blue-text": "var(--mantine-color-blue-filled)",
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
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover":
        "color-mix(in srgb, var(--app-color-attention) 82%, white)",
      "--mantine-color-attention-light":
        "color-mix(in srgb, var(--app-color-attention) 22%, transparent)",
      "--mantine-color-attention-light-hover":
        "color-mix(in srgb, var(--app-color-attention) 32%, transparent)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil)",
      "--mantine-color-fossil-filled-hover":
        "color-mix(in srgb, var(--app-color-fossil) 82%, white)",
      "--mantine-color-fossil-light":
        "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-hover":
        "color-mix(in srgb, var(--app-color-fossil) 32%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
  });
}

export function createAppTheme(
  tokens: AppTokens = defaultAppTokens,
  density: UiDensity = "comfortable",
): MantineThemeOverride {
  /**
   * Prior product used Mantine’s default control size (`sm`). Comfortable must not
   * enlarge to `md`. Compact steps inputs/buttons to `xs`; Switch/Checkbox/Radio stay
   * at Mantine `sm` so hit targets remain usable (~24px+).
   */
  const compactControlDefaults =
    density === "compact"
      ? ({
          Input: { defaultProps: { size: "xs" } },
          InputBase: { defaultProps: { size: "xs" } },
          TextInput: { defaultProps: { size: "xs" } },
          NumberInput: { defaultProps: { size: "xs" } },
          PasswordInput: { defaultProps: { size: "xs" } },
          Textarea: { defaultProps: { size: "xs" } },
          Select: { defaultProps: { size: "xs" } },
          NativeSelect: { defaultProps: { size: "xs" } },
          Autocomplete: { defaultProps: { size: "xs" } },
          MultiSelect: { defaultProps: { size: "xs" } },
          TagsInput: { defaultProps: { size: "xs" } },
          SegmentedControl: { defaultProps: { size: "xs" } },
          Button: { defaultProps: { size: "xs" } },
          ActionIcon: { defaultProps: { size: "xs" } },
        } as const)
      : {};

  return createTheme({
    primaryColor: "blue",
    primaryShade: 5,
    fontFamily: '"Segoe UI", Arial, sans-serif',
    defaultRadius: "md",
    /** Aligns `gap="xs"|…` / `p="md"` with `--app-space-*` (overrides Mantine defaults). */
    spacing: {
      xxs: `${tokens.spacing.xxs}px`,
      xs: `${tokens.spacing.xs}px`,
      sm: `${tokens.spacing.sm}px`,
      md: `${tokens.spacing.md}px`,
      lg: `${tokens.spacing.lg}px`,
      xl: `${tokens.spacing.xl}px`,
    },
    radius: {
      sm: `${tokens.radius.sm}px`,
      md: `${tokens.radius.md}px`,
      lg: `${tokens.radius.lg}px`,
    },
    fontSizes: {
      xs: `${tokens.fontSizes.xs}px`,
      sm: `${tokens.fontSizes.sm}px`,
      md: `${tokens.fontSizes.md}px`,
      lg: `${tokens.fontSizes.lg}px`,
      xl: `${tokens.fontSizes.xl}px`,
    },
    headings: {
      sizes: {
        /** Line-heights match Mantine DEFAULT_THEME (Comfortable = prior look). */
        h1: { fontSize: `${tokens.headings.h1}px`, lineHeight: "1.3" },
        h2: { fontSize: `${tokens.headings.h2}px`, lineHeight: "1.35" },
        h3: { fontSize: `${tokens.headings.h3}px`, lineHeight: "1.4" },
        h4: { fontSize: `${tokens.headings.h4}px`, lineHeight: "1.45" },
        h5: { fontSize: `${tokens.headings.h5}px`, lineHeight: "1.5" },
        h6: { fontSize: `${tokens.headings.h6}px`, lineHeight: "1.5" },
      },
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
      /** Matches `--app-color-attention` / server-card attention rail. */
      attention: [
        "#fbfce3",
        "#f7f9c4",
        "#f2f5a0",
        "#eef17c",
        "#eaef6e",
        tokens.colors.attention,
        "#cfd645",
        "#aeb234",
        "#8a8e28",
        "#676b1e",
      ],
      /** Matches `--app-color-fossil` / warn amber (unsaved-leave alerts). */
      fossil: [
        "#fbf4e8",
        "#f5e6c8",
        "#edcfa0",
        "#e5b878",
        "#dfac68",
        tokens.colors.fossil,
        "#c49452",
        "#a67a42",
        "#866032",
        "#624724",
      ],
      /** Matches `--app-color-ok` (current / healthy). */
      ok: [
        "#e6f8f0",
        "#c8efdc",
        "#a5e5c6",
        "#7fd9ae",
        "#68d0a2",
        tokens.colors.ok,
        "#45b585",
        "#35986e",
        "#2a7a58",
        "#1f5c42",
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
      Alert: {
        defaultProps: {
          variant: "light",
          radius: "md",
        },
        // Mantine paints via --alert-bg / --alert-bd; styles.backgroundColor does not win.
        vars: (_theme: unknown, props: { color?: string | undefined }) => {
          const color =
            typeof props.color === "string" ? props.color : "blue";
          const tone = alertToneForColor(color);
          if (tone === "message") {
            return {
              root: {
                "--alert-bg":
                  "color-mix(in srgb, var(--ark-blue-8) 14%, transparent)",
                "--alert-bd":
                  "1px solid color-mix(in srgb, var(--ark-blue-8) 28%, transparent)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          if (tone === "warn") {
            // MagicPath mock: bg-card/60 + border fossil/40 (translucent, not solid mix).
            return {
              root: {
                "--alert-bg":
                  "color-mix(in srgb, var(--app-color-panel) 60%, transparent)",
                "--alert-bd":
                  "1px solid color-mix(in srgb, var(--app-color-fossil) 40%, transparent)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          if (tone === "error") {
            return {
              root: {
                "--alert-bg":
                  "color-mix(in srgb, var(--app-color-bad) 14%, transparent)",
                "--alert-bd":
                  "1px solid color-mix(in srgb, var(--app-color-bad) 45%, transparent)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          return { root: {} };
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
      ...compactControlDefaults,
    },
  });
}

/** Inline Alert surface recipes: message (blue), warn (fossil), error (red). */
function alertToneForColor(
  color: string,
): "message" | "warn" | "error" | "default" {
  if (
    color === "blue" ||
    color === "cyan" ||
    color === "indigo" ||
    color === "violet"
  ) {
    return "message";
  }
  if (
    color === "yellow" ||
    color === "orange" ||
    color === "fossil" ||
    color === "attention" ||
    color === "warn"
  ) {
    return "warn";
  }
  if (color === "red" || color === "pink") {
    return "error";
  }
  return "default";
}

export function createAppThemeForDensity(density: UiDensity): MantineThemeOverride {
  return createAppTheme(getAppTokens(density), density);
}

export function createAppCssVariablesResolverForDensity(
  density: UiDensity,
): CSSVariablesResolver {
  return createAppCssVariablesResolver(getAppTokens(density));
}
