import { createTheme, type CSSVariablesResolver, type MantineThemeOverride } from "@mantine/core";
import {
  appTokens as defaultAppTokens,
  createDangerRedPalette,
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

function createAppCssVariablesResolver(
  tokens: AppTokens = defaultAppTokens,
): CSSVariablesResolver {
  return () => ({
    variables: {
      ...radixCssVariables,
      "--app-color-bg": "var(--ark-background)",
      "--app-color-surface-chrome": "var(--ark-gray-2)",
      "--app-color-surface-panel": "var(--ark-gray-3)",
      "--app-color-surface-control": "var(--ark-gray-5)",
      "--app-color-surface-control-hover": "var(--ark-gray-6)",
      "--app-color-border-subtle": "var(--ark-gray-7)",
      "--app-color-border-control": "var(--ark-gray-9)",
      "--app-color-text-soft": "var(--ark-gray-12)",
      "--app-color-muted-soft": tokens.colors.muted,
      "--app-color-bg-accent": "var(--app-color-surface-chrome)",
      "--app-color-panel": "var(--app-color-surface-panel)",
      "--app-color-panel-alt": "var(--app-color-surface-control)",
      "--app-color-panel-cool": "var(--app-color-surface-panel)",
      "--app-color-panel-cool-emphasis": "var(--app-color-surface-panel)",
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
      "--app-color-danger-bright": tokens.colors.dangerBright,
      "--app-color-cryo": "var(--ark-blue-11)",
      "--app-color-biomass": tokens.colors.biomass,
      "--app-color-fossil": tokens.colors.fossil,
      "--app-color-fossil-filled": tokens.colors.fossilFilled,
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
      "--app-form-description-size": `${tokens.formDescription}px`,
      "--app-form-label-size": `${tokens.formLabel}px`,
      "--app-font-page": `${tokens.pageTitle}px`,
      "--app-shadow-panel": tokens.shadows.panel,
      "--app-shadow-elevated": "0 18px 36px rgba(0, 0, 0, 0.32)",
      /* Shared surface recipes — prefer AppSurfaceCard / these vars over copy-pasted gradients */
      "--app-surface-border": "var(--app-color-border)",
      "--app-surface-cool": "none",
      "--app-surface-cool-emphasis": "none",
      "--app-surface-flat": "var(--app-color-panel)",
      "--app-surface-chrome": "var(--app-color-surface-chrome)",
      "--app-list-selected-bg": "var(--app-color-surface-control)",
      "--app-list-selected-inset": "inset 3px 0 0 var(--ark-blue-9)",
      "--app-anchor-color": "var(--ark-blue-11)",
      "--app-anchor-hover-color": "var(--ark-blue-12)",
    },
    light: {},
    dark: {
      "--mantine-color-body": "var(--app-color-bg)",
      "--mantine-color-text": "var(--app-color-text)",
      "--mantine-color-dimmed": "var(--app-color-muted)",
      "--mantine-color-dark-0": "var(--app-color-text)",
      "--mantine-color-dark-1": "var(--app-color-muted)",
      "--mantine-color-dark-2": "var(--ark-gray-10)",
      "--mantine-color-dark-3": "var(--ark-gray-8)",
      "--mantine-color-dark-4": "var(--ark-gray-7)",
      "--mantine-color-dark-5": "var(--ark-gray-6)",
      "--mantine-color-dark-6": "var(--app-color-surface-control)",
      "--mantine-color-dark-7": "var(--app-color-surface-panel)",
      "--mantine-color-dark-8": "var(--app-color-surface-chrome)",
      "--mantine-color-dark-9": "var(--app-color-bg)",
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
      "--mantine-color-red-filled": "var(--app-color-bad)",
      "--mantine-color-red-filled-hover":
        "color-mix(in srgb, var(--app-color-bad) 88%, white)",
      "--mantine-color-red-light":
        "color-mix(in srgb, var(--app-color-danger-bright) 22%, transparent)",
      "--mantine-color-red-light-hover":
        "color-mix(in srgb, var(--app-color-danger-bright) 32%, transparent)",
      "--mantine-color-red-light-color": "var(--app-color-danger-bright)",
      "--mantine-color-red-text": "var(--app-color-danger-bright)",
      "--mantine-color-red-6": "var(--app-color-danger-bright)",
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover":
        "color-mix(in srgb, var(--app-color-attention) 82%, white)",
      "--mantine-color-attention-light":
        "color-mix(in srgb, var(--app-color-attention) 22%, transparent)",
      "--mantine-color-attention-light-hover":
        "color-mix(in srgb, var(--app-color-attention) 32%, transparent)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil-filled)",
      "--mantine-color-fossil-filled-hover":
        "color-mix(in srgb, var(--app-color-fossil-filled) 82%, white)",
      "--mantine-color-fossil-light":
        "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-hover":
        "color-mix(in srgb, var(--app-color-fossil) 32%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
  });
}

function createAppTheme(
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
          NativeSelect: { defaultProps: { size: "xs" } },
          SegmentedControl: { defaultProps: { size: "xs" } },
          Button: { defaultProps: { size: "xs" } },
          ActionIcon: { defaultProps: { size: "xs" } },
        } as const)
      : {};

  /** Hide ScrollArea chrome until content overflows (#395). */
  const dropdownScrollAreaProps = {
    type: "auto" as const,
    offsetScrollbars: false as const,
    /** OptionsDropdown hardcodes a tiny scrollbarSize; keep a normal thumb. */
    scrollbarSize: 8,
  };
  const comboboxScrollDefaults = {
    ...(density === "compact" ? { size: "xs" as const } : {}),
    scrollAreaProps: dropdownScrollAreaProps,
  };

  return createTheme({
    primaryColor: "blue",
    primaryShade: 5,
    /** Dark text on light filled colors (fossil Restart, attention); white on red/teal filled. */
    autoContrast: true,
    fontFamily: '"Segoe UI", Arial, sans-serif',
    defaultRadius: "sm",
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
      /** Same ladder as fossil — needs-attention is amber, not lime (#470). */
      attention: [
        "#fbf4e8",
        "#f5e6c8",
        "#edcfa0",
        "#e5b878",
        tokens.colors.attention,
        tokens.colors.fossilFilled,
        "#a65408",
        "#8a4607",
        "#6e3805",
        "#4a2603",
      ],
      /** Index 5 = filled Restart; index 4 = base fossil for alerts/light. */
      fossil: [
        "#fbf4e8",
        "#f5e6c8",
        "#edcfa0",
        "#e5b878",
        tokens.colors.fossil,
        tokens.colors.fossilFilled,
        "#a65408",
        "#8a4607",
        "#6e3805",
        "#4a2603",
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
      /** Matches `--app-color-bad` / danger (destructive filled buttons). */
      red: createDangerRedPalette(tokens.colors.bad, tokens.colors.dangerBright),
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
          radius: "sm",
        },
        // Mantine paints via --alert-bg / --alert-bd; styles.backgroundColor does not win.
        vars: (_theme: unknown, props: { color?: string | undefined }) => {
          const color =
            typeof props.color === "string" ? props.color : "blue";
          const tone = alertToneForColor(color);
          if (tone === "message") {
            return {
              root: {
                "--alert-bg": "var(--app-color-panel)",
                "--alert-bd": "1px solid var(--app-color-cryo)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          if (tone === "warn") {
            return {
              root: {
                "--alert-bg": "var(--app-color-panel)",
                "--alert-bd": "1px solid var(--app-color-fossil)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          if (tone === "error") {
            return {
              root: {
                "--alert-bg": "var(--app-color-panel)",
                "--alert-bd": "1px solid var(--app-color-bad)",
                "--alert-color": "var(--app-color-text)",
              },
            };
          }
          return { root: {} };
        },
      },
      Badge: {
        defaultProps: {
          radius: "sm",
        },
      },
      NavLink: {
        defaultProps: {
          radius: "sm",
        },
        styles: {
          root: {
            "--nl-bg": "var(--app-color-surface-control)",
            "--nl-hover": "var(--app-color-surface-control-hover)",
            "--nl-color": "var(--app-color-text)",
          },
        },
      },
      Card: {
        defaultProps: {
          withBorder: true,
          radius: "sm",
          padding: "md",
        },
      },
      Paper: {
        defaultProps: {
          radius: "sm",
        },
      },
      ScrollArea: {
        defaultProps: {
          type: "auto",
        },
      },
      ScrollAreaAutosize: {
        defaultProps: {
          type: "auto",
        },
      },
      Select: {
        defaultProps: comboboxScrollDefaults,
      },
      MultiSelect: {
        defaultProps: comboboxScrollDefaults,
      },
      Autocomplete: {
        defaultProps: comboboxScrollDefaults,
      },
      TagsInput: {
        defaultProps: comboboxScrollDefaults,
      },
      InputWrapper: {
        styles: {
          label: {
            fontSize: "var(--app-form-label-size)",
            fontWeight: 500,
          },
          description: {
            fontSize: "var(--app-form-description-size)",
            lineHeight: 1.5,
          },
        },
      },
      Anchor: {
        defaultProps: {
          underline: "always",
        },
        styles: {
          root: {
            "--anchor-color": "var(--app-anchor-color)",
            "--anchor-hover-color": "var(--app-anchor-hover-color)",
            color: "var(--anchor-color)",
            textDecorationColor:
              "color-mix(in srgb, var(--anchor-color) 55%, transparent)",
            "&:hover": {
              color: "var(--anchor-hover-color)",
              textDecorationColor:
                "color-mix(in srgb, var(--anchor-hover-color) 70%, transparent)",
            },
          },
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
