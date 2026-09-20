import { createTheme, type CSSVariablesResolver, type MantineThemeOverride } from "@mantine/core";
import {
  appTokens as defaultAppTokens,
  type AppThemePalette,
  type AppTokens,
  type UiDensity,
  getAppTokens,
} from "./tokens";
import { DEFAULT_APP_THEME, type AppTheme } from "./themes";

/**
 * Palette steps for one theme (#PUX-004 Track B). The `--app-*` role map below
 * stays shared: only the palette it points at changes per theme.
 */
function buildRadixCssVariables(palette: AppThemePalette): Record<string, string> {
  return Object.fromEntries([
    ...palette.blue.map((value, index) => [`--ark-blue-${index + 1}`, value]),
    ...palette.blueAlpha.map((value, index) => [`--ark-blue-a${index + 1}`, value]),
    ...palette.gray.map((value, index) => [`--ark-gray-${index + 1}`, value]),
    ...palette.grayAlpha.map((value, index) => [`--ark-gray-a${index + 1}`, value]),
    ["--ark-blue-contrast", palette.blueContrast],
    ["--ark-blue-surface", palette.blueSurface],
    ["--ark-blue-indicator", palette.blue[8]],
    ["--ark-blue-track", palette.blue[8]],
    ["--ark-gray-contrast", palette.grayContrast],
    ["--ark-gray-surface", palette.graySurface],
    ["--ark-gray-indicator", palette.gray[8]],
    ["--ark-gray-track", palette.gray[8]],
    ["--ark-background", palette.background],
  ]);
}

function createAppCssVariablesResolver(
  tokens: AppTokens = defaultAppTokens,
  theme: AppTheme = DEFAULT_APP_THEME,
): CSSVariablesResolver {
  return () => ({
    variables: {
      ...buildRadixCssVariables(theme.palette),
      "--app-color-bg": "var(--ark-background)",
      "--app-color-surface-chrome": "var(--ark-gray-2)",
      /*
       * Shell atmosphere shared by the AppShell canvas and the app main surface.
       * Hidden for now (reads yellowish over chrome). To restore, replace `none`
       * with the two radial gradients:
       *   radial-gradient(ellipse 58% 48% at 92% -10%, var(--app-shell-glow), transparent 70%),
       *   radial-gradient(ellipse 40% 32% at 52% 110%, color-mix(in srgb, var(--app-color-fossil) 6%, transparent), transparent 74%)
       */
      "--app-shell-glow": "rgba(255, 255, 255, 0.055)",
      "--app-shell-atmosphere": "none",
      /*
       * Brand, not theme: the logo lockup is a dark-navy mark with a light
       * wordmark, so the light theme backs it with this plate instead of leaving
       * it to disappear into a near-white sidebar.
       */
      "--app-brand-plate": "#0d1526",
      "--app-color-surface-panel": "var(--ark-gray-3)",
      "--app-color-surface-control": "var(--ark-gray-5)",
      "--app-color-surface-control-hover": "var(--ark-gray-6)",
      /*
       * Alert / InfoBar surface. Built from the hull steps (2 and 12 are not plate steps),
       * so it stays neutral when the plates are warm or tinted, and it sits above both the
       * chrome shell (0.17 L) and the panel cards (0.23 L) - the two backgrounds an alert
       * actually lands on. Fluent keeps an info bar quiet: the tone belongs on the border
       * and icon, never on the fill.
       */
      "--app-color-surface-alert": "color-mix(in srgb, var(--ark-gray-2) 82%, var(--ark-gray-12))",
      "--app-color-border-subtle": "var(--ark-gray-7)",
      "--app-color-border-control": "var(--ark-gray-9)",
      "--app-color-text-soft": "var(--ark-gray-12)",
      "--app-color-muted-soft": "var(--ark-gray-11)",
      "--app-color-bg-accent": "var(--app-color-surface-chrome)",
      "--app-color-panel": "var(--app-color-surface-panel)",
      "--app-color-panel-alt": "var(--app-color-surface-control)",
      "--app-color-panel-cool": "var(--app-color-surface-panel)",
      "--app-color-panel-cool-emphasis": "var(--app-color-surface-panel)",
      "--app-color-border": "var(--app-color-border-subtle)",
      "--app-color-text": "var(--app-color-text-soft)",
      "--app-color-muted": "var(--app-color-muted-soft)",
      "--app-color-accent": "var(--ark-blue-9)",
      /* Accent role set — one hue, its states. See `accentPalette` for the source. */
      "--app-color-accent-hover": "var(--ark-blue-10)",
      "--app-color-accent-text": "var(--ark-blue-11)",
      "--app-color-accent-subtle": "var(--ark-blue-a3)",
      "--app-color-accent-subtle-hover": "var(--ark-blue-a4)",
      "--app-color-accent-contrast": "#ffffff",
      /* One brand-coloured focus ring for the whole app (alpha so it reads on any surface). */
      "--app-color-focus-ring": "var(--ark-blue-a8)",
      /* Informational state reported by the server — deliberately NOT the accent. */
      "--app-color-info": "var(--app-color-cryo)",
      /* Aliases so Downloads / feature CSS color-mix can paint (Slice 1). */
      "--app-color-primary": "var(--app-color-accent)",
      "--app-color-accent-deep": "var(--ark-blue-3)",
      "--app-color-panel-raised": "var(--ark-gray-4)",
      "--app-color-ok": theme.colors.ok,
      "--app-color-warn": theme.colors.warn,
      "--app-color-attention": theme.colors.attention,
      "--app-color-bad": theme.colors.bad,
      "--app-color-danger": "var(--app-color-bad)",
      "--app-color-danger-bright": theme.colors.dangerBright,
      "--app-color-cryo": "var(--ark-blue-11)",
      "--app-color-biomass": theme.colors.biomass,
      "--app-color-fossil": theme.colors.fossil,
      "--app-color-fossil-filled": theme.colors.fossilFilled,
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
      /*
       * Fluent 2 motion (#PUX-004): use these instead of ad-hoc durations and
       * `ease`. `fast` for hover/press feedback, `base` for reveals, `slow` for
       * layout changes. Ease is the Fluent standard curve.
       */
      "--app-motion-fast": "150ms",
      "--app-motion-base": "200ms",
      "--app-motion-slow": "300ms",
      "--app-ease-standard": "cubic-bezier(0.33, 0, 0.67, 1)",
      "--app-ease-decelerate": "cubic-bezier(0.1, 0.9, 0.2, 1)",
      "--app-form-description-size": `${tokens.formDescription}px`,
      "--app-form-label-size": `${tokens.formLabel}px`,
      "--app-font-page": `${tokens.pageTitle}px`,
      "--app-font-title-lg": `${tokens.titleLg}px`,
      "--app-font-title-md": `${tokens.titleMd}px`,
      "--app-font-title-sm": `${tokens.titleSm}px`,
      "--app-font-eyebrow": `${tokens.eyebrowSize}px`,
      "--app-font-display": '"Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", Arial, sans-serif',
      "--app-font-mono": '"Cascadia Mono", Consolas, monospace',
      "--app-shadow-panel": theme.shadows.panel,
      /* Fluent 2 elevation ladder: 2 (chip/badge) - 4 (card in flow) - 8 (menu) -
       * 16 (flyout/popover) - 28 (dock/dialog over content). Two layers each. */
      "--app-elevation-2": theme.shadows.elevation2,
      "--app-elevation-4": theme.shadows.elevation4,
      "--app-elevation-8": theme.shadows.elevation8,
      "--app-elevation-16": theme.shadows.elevation16,
      "--app-elevation-28": theme.shadows.elevation28,
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
    light: {
      /*
       * Same role remaps as the dark map, on Mantine's light-scheme keys: the
       * neutral family is `gray-*` there (`dark-*` is inert), and `body` stays the
       * app panel so Paper / Modal / Popover / datatable surfaces do not fall back
       * to Mantine's default white.
       */
      "--mantine-color-body": "var(--app-color-surface-panel)",
      "--mantine-color-text": "var(--app-color-text)",
      "--mantine-color-dimmed": "var(--app-color-muted)",
      "--mantine-color-gray-0": "var(--app-color-bg)",
      "--mantine-color-gray-1": "var(--app-color-surface-chrome)",
      "--mantine-color-gray-2": "var(--app-color-surface-panel)",
      "--mantine-color-gray-3": "var(--app-color-panel-raised)",
      "--mantine-color-gray-4": "var(--app-color-surface-control)",
      "--mantine-color-gray-5": "var(--app-color-surface-control-hover)",
      "--mantine-color-gray-6": "var(--app-color-border-subtle)",
      "--mantine-color-gray-7": "var(--app-color-border-control)",
      "--mantine-color-gray-8": "var(--ark-gray-9)",
      "--mantine-color-gray-9": "var(--ark-gray-10)",
      "--mantine-color-default": "var(--app-color-surface-control)",
      "--mantine-color-default-hover": "var(--app-color-surface-control-hover)",
      "--mantine-color-default-border": "var(--app-color-border-control)",
      "--mantine-color-default-color": "var(--app-color-text)",
      "--mantine-color-blue-0": "var(--ark-blue-1)",
      "--mantine-color-blue-1": "var(--ark-blue-2)",
      "--mantine-color-blue-2": "var(--ark-blue-3)",
      "--mantine-color-blue-3": "var(--ark-blue-4)",
      "--mantine-color-blue-4": "var(--ark-blue-5)",
      "--mantine-color-blue-5": "var(--ark-blue-6)",
      "--mantine-color-blue-6": "var(--ark-blue-8)",
      "--mantine-color-blue-7": "var(--ark-blue-9)",
      "--mantine-color-blue-8": "var(--ark-blue-10)",
      "--mantine-color-blue-9": "var(--ark-blue-12)",
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
      "--mantine-color-red-filled-hover": "color-mix(in srgb, var(--app-color-bad) 88%, black)",
      "--mantine-color-red-light": "color-mix(in srgb, var(--app-color-danger-bright) 14%, transparent)",
      "--mantine-color-red-light-hover": "color-mix(in srgb, var(--app-color-danger-bright) 22%, transparent)",
      "--mantine-color-red-light-color": "var(--app-color-danger-bright)",
      "--mantine-color-red-text": "var(--app-color-danger-bright)",
      "--mantine-color-red-6": "var(--app-color-danger-bright)",
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover": "color-mix(in srgb, var(--app-color-attention) 88%, black)",
      "--mantine-color-attention-light": "color-mix(in srgb, var(--app-color-attention) 14%, transparent)",
      "--mantine-color-attention-light-hover": "color-mix(in srgb, var(--app-color-attention) 22%, transparent)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil-filled)",
      "--mantine-color-fossil-filled-hover": "color-mix(in srgb, var(--app-color-fossil-filled) 88%, black)",
      "--mantine-color-fossil-light": "color-mix(in srgb, var(--app-color-fossil) 14%, transparent)",
      "--mantine-color-fossil-light-hover": "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
    dark: {
      /*
       * Mantine's own dark default for `--mantine-color-body` is `dark-7` (a panel),
       * and Paper / Modal content / Popover / datatable all inherit from it. Keep it
       * on the panel surface, not the page canvas: the document and AppShell canvas
       * are set explicitly in `globals.css` / `AppShellLayout`, so pointing this at
       * `--app-color-bg` only made every dialog surface render darker than the app.
       */
      "--mantine-color-body": "var(--app-color-surface-panel)",
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
      /*
       * Mantine's `default` variant (outlined buttons, badges, popovers) otherwise
       * keeps Mantine's own mapping — including a hardcoded `white` label. Derive
       * the whole set from the palette so it stays correct if surfaces lighten.
       */
      "--mantine-color-default": "var(--app-color-surface-control)",
      "--mantine-color-default-hover": "var(--app-color-surface-control-hover)",
      "--mantine-color-default-border": "var(--app-color-border-control)",
      "--mantine-color-default-color": "var(--app-color-text)",
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
      "--mantine-color-red-filled-hover": "color-mix(in srgb, var(--app-color-bad) 88%, white)",
      "--mantine-color-red-light": "color-mix(in srgb, var(--app-color-danger-bright) 22%, transparent)",
      "--mantine-color-red-light-hover": "color-mix(in srgb, var(--app-color-danger-bright) 32%, transparent)",
      "--mantine-color-red-light-color": "var(--app-color-danger-bright)",
      "--mantine-color-red-text": "var(--app-color-danger-bright)",
      "--mantine-color-red-6": "var(--app-color-danger-bright)",
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover": "color-mix(in srgb, var(--app-color-attention) 82%, white)",
      "--mantine-color-attention-light": "color-mix(in srgb, var(--app-color-attention) 22%, transparent)",
      "--mantine-color-attention-light-hover": "color-mix(in srgb, var(--app-color-attention) 32%, transparent)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil-filled)",
      "--mantine-color-fossil-filled-hover": "color-mix(in srgb, var(--app-color-fossil-filled) 82%, white)",
      "--mantine-color-fossil-light": "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-hover": "color-mix(in srgb, var(--app-color-fossil) 32%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
  });
}

function createAppTheme(
  tokens: AppTokens = defaultAppTokens,
  density: UiDensity = "comfortable",
  theme: AppTheme = DEFAULT_APP_THEME,
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
          Button: { defaultProps: { size: "xs" } },
          ActionIcon: { defaultProps: { size: "xs" } },
        } as const)
      : {};

  /*
   * Fluent TabList shape: pill track, raised pill indicator, no item borders. `xl`
   * (32px) is larger than any control height, so the pill holds at every size. The
   * indicator stays *lighter* than the track - never a darker well.
   * Kept out of `compactControlDefaults`: that object is spread last, so a
   * SegmentedControl entry there would replace this whole recipe (shallow spread).
   */
  const segmentedControlDefaults = {
    defaultProps: {
      radius: "xl" as const,
      withItemsBorders: false,
      ...(density === "compact" ? { size: "xs" as const } : {}),
    },
    vars: (_theme: unknown, props: { color?: string | undefined }) => ({
      root: {
        /* Neutral selected pill, three steps above the track, unless the caller
         * encodes meaning with `color` (the wizard passes the preset / difficulty
         * colour). The check is on the prop rather than a `defaultProps.color` so a
         * call site that computes `color` and gets `undefined` still gets the fill.
         * `--sc-label-color` is deliberately NOT set: Mantine then paints the active
         * label with the fill's contrast colour instead of text grey. */
        ...(props.color === undefined ? { "--sc-color": "var(--app-color-surface-control-hover)" } : {}),
        "--sc-shadow": "var(--app-elevation-2)",
      },
    }),
    styles: {
      root: {
        backgroundColor: "var(--app-color-panel-raised)",
      },
      /* Mantine hardcodes `box-shadow: none` on the indicator in dark scheme and
       * only reads `--sc-shadow` in light, so set it inline to get the lift. */
      indicator: {
        boxShadow: "var(--app-elevation-2)",
      },
    },
  };

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
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif',
    fontFamilyMonospace: '"Cascadia Mono", Consolas, monospace',
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
    /** Fluent 2 elevation scale: `shadow="xs"|…|"xl"` resolves onto the same ladder. */
    shadows: {
      xs: theme.shadows.elevation2,
      sm: theme.shadows.elevation4,
      md: theme.shadows.elevation8,
      lg: theme.shadows.elevation16,
      xl: theme.shadows.elevation28,
    },
    headings: {
      sizes: {
        /** Line-heights match Mantine DEFAULT_THEME (Comfortable = prior look). */
        h1: { fontSize: `${tokens.headings.h1}px`, lineHeight: "1.3" },
        /* h2-h6 are the section-title ramp so `Title order` and the atoms agree. */
        h2: { fontSize: `${tokens.titleLg}px`, lineHeight: "1.35" },
        h3: { fontSize: `${tokens.titleLg}px`, lineHeight: "1.4" },
        h4: { fontSize: `${tokens.titleMd}px`, lineHeight: "1.45" },
        h5: { fontSize: `${tokens.titleSm}px`, lineHeight: "1.5" },
        h6: { fontSize: `${tokens.headings.h6}px`, lineHeight: "1.5" },
      },
    },
    colors: {
      blue: [
        theme.palette.blue[11],
        theme.palette.blue[10],
        theme.palette.blue[7],
        theme.palette.blue[6],
        theme.palette.blue[5],
        theme.palette.blue[8],
        theme.palette.blue[9],
        theme.palette.blue[4],
        theme.palette.blue[2],
        theme.palette.blue[0],
      ],
      /** Same ladder as fossil — needs-attention is amber, not lime (#470). */
      attention: theme.ladders.attention,
      /** Index 5 = filled Restart; index 4 = base fossil for alerts/light. */
      fossil: theme.ladders.fossil,
      /** Matches `--app-color-ok` (current / healthy). */
      ok: theme.ladders.ok,
      /** Matches `--app-color-bad` / danger (destructive filled buttons). */
      red: theme.ladders.red,
      dark: [
        theme.palette.gray[11],
        theme.palette.gray[10],
        theme.palette.gray[9],
        theme.palette.gray[7],
        theme.palette.gray[6],
        theme.palette.gray[5],
        theme.palette.gray[3],
        theme.palette.gray[2],
        theme.palette.gray[1],
        theme.palette.gray[0],
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
        styles: {
          /* Fluent keeps an info bar's severity to the icon and border. The icon needs its
           * own variable: Mantine paints it with `--alert-color`, which the title inherits
           * too, and the title has to stay in the text tone. An unmapped colour leaves
           * `--alert-icon-color` unset, so the icon inherits the root colour as before. */
          icon: { color: "var(--alert-icon-color)" },
        },
        // Mantine paints via --alert-bg / --alert-bd; styles.backgroundColor does not win.
        vars: (_theme: unknown, props: { color?: string | undefined }) => {
          const color = typeof props.color === "string" ? props.color : "blue";
          const toneToken = ALERT_TONE_TOKENS[alertToneForColor(color)];
          if (toneToken === undefined) {
            return { root: {} };
          }
          return {
            root: {
              /* Neutral base (see `--app-color-surface-alert`) so a tinted plate ramp cannot
               * turn the bar into a slab, plus 12% of the tone: enough to type the alert
               * without painting a saturated fill. */
              "--alert-bg": `color-mix(in srgb, var(--app-color-surface-alert) 88%, ${toneToken})`,
              "--alert-bd": `1px solid ${toneToken}`,
              "--alert-color": "var(--app-color-text)",
              "--alert-icon-color": toneToken,
            },
          };
        },
      },
      /*
       * Fluent 2 badge: 4px corners, 12px semibold, sentence case (Mantine uppercases
       * and fills by default), and neutral unless a semantic colour is passed - a badge
       * has to earn its colour, and `blue` is the accent (brand/selection), not a fact.
       */
      Badge: {
        defaultProps: {
          radius: "sm",
          size: "sm",
          variant: "light",
          color: "gray",
          tt: "none",
          fw: 600,
        },
        styles: {
          root: {
            /* Mantine's badge type is micro-text (9-11px at every size) with
             * letter-spacing; Fluent 2 badges read 12px on a 20px pill, flush, which
             * is what the rest of the app is sized against. One badge size, so no
             * per-call-site size props. */
            fontSize: "12px",
            height: "20px",
            paddingInline: "8px",
            letterSpacing: "normal",
          },
        },
        /* A *neutral* badge has to read on any surface: Mantine's gray tint sits
         * darker than our chrome, so it vanished until hover. Give the uncoloured
         * badge the control fill plus a hairline - a real chip - and leave semantic
         * colours on Mantine's tint. */
        vars: (_theme: unknown, props: { color?: string | undefined }) => {
          const neutral = props.color === undefined || props.color === "gray";
          return neutral
            ? {
                root: {
                  "--badge-bg": "var(--app-color-surface-control)",
                  "--badge-bd": "1px solid var(--app-color-border-subtle)",
                  "--badge-color": "var(--app-color-text)",
                },
              }
            : { root: {} };
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
      SegmentedControl: segmentedControlDefaults,
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
      /* Fluent 2 order: the label reads before the control, so a Switch label sits
       * to the left of the track. Rows that already have their own title only pass
       * `aria-label`, which this does not affect. */
      Switch: {
        defaultProps: {
          labelPosition: "left",
        },
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
      /*
       * Fluent 2 tooltip: 4px corners, 12px text, tight padding, no arrow, and a
       * hairline so the surface separates on any shell.
       */
      Tooltip: {
        defaultProps: {
          radius: 4,
          fz: "xs",
          px: "xs",
          py: 4,
          withArrow: false,
        },
        styles: {
          tooltip: { border: "1px solid var(--app-color-border-subtle)" },
        },
      },
      /*
       * Fluent flyout chrome: 8px shell, 4px rows on a 32px row height, 1px
       * hairline separator (Mantine hardcodes its own divider colour). Row hover
       * uses the app control-hover so menu rows match every other hover, and
       * `--sc`-style colour props on an item still win over this inherited value.
       */
      Menu: {
        defaultProps: {
          radius: "md",
        },
        styles: {
          dropdown: {
            "--menu-item-hover": "var(--app-color-surface-control-hover)",
          },
          item: {
            borderRadius: "var(--app-radius-control)",
            minHeight: 32,
          },
          divider: {
            borderColor: "var(--app-color-border-subtle)",
          },
        },
      },
      /** Flyouts / popovers share the menu shell: 8px, still 4px on their rows. */
      Popover: {
        defaultProps: {
          radius: "md",
        },
      },
      /** Fluent ProgressBar is a thin 4px bar; call sites may still pass `size`. */
      Progress: {
        defaultProps: {
          size: 4,
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
            textDecorationColor: "color-mix(in srgb, var(--anchor-color) 55%, transparent)",
            "&:hover": {
              color: "var(--anchor-hover-color)",
              textDecorationColor: "color-mix(in srgb, var(--anchor-hover-color) 70%, transparent)",
            },
          },
        },
      },
      ...compactControlDefaults,
    },
  });
}

/** Inline Alert surface recipes: message (blue), warn (fossil), error (red). */
export function alertToneForColor(color: string): "message" | "success" | "warn" | "error" | "default" {
  if (color === "blue" || color === "cyan" || color === "indigo" || color === "violet") {
    return "message";
  }
  /* `ok` is the app's success role; green/teal are accepted aliases so an Alert
   * keeps its meaning whether the call site still says one or the other. */
  if (color === "ok" || color === "green" || color === "teal") {
    return "success";
  }
  if (color === "yellow" || color === "orange" || color === "fossil" || color === "attention" || color === "warn") {
    return "warn";
  }
  if (color === "red" || color === "pink") {
    return "error";
  }
  return "default";
}

/**
 * Severity tone to the token that carries it, used for the alert border, its 12% fill tint
 * and its icon. `default` has no tone, so an unmapped colour keeps Mantine's defaults.
 */
const ALERT_TONE_TOKENS: Partial<Record<ReturnType<typeof alertToneForColor>, string>> = {
  message: "var(--app-color-cryo)",
  success: "var(--app-color-ok)",
  warn: "var(--app-color-fossil)",
  error: "var(--app-color-bad)",
};

export function createAppThemeForAppearance(appearance: AppTheme, density: UiDensity): MantineThemeOverride {
  return createAppTheme(getAppTokens(density), density, appearance);
}

export function createAppCssVariablesResolverForAppearance(
  appearance: AppTheme,
  density: UiDensity,
): CSSVariablesResolver {
  return createAppCssVariablesResolver(getAppTokens(density), appearance);
}

/** Default theme + density: the shipped dark shell. */
export function createAppThemeForDensity(density: UiDensity): MantineThemeOverride {
  return createAppThemeForAppearance(DEFAULT_APP_THEME, density);
}

export function createAppCssVariablesResolverForDensity(density: UiDensity): CSSVariablesResolver {
  return createAppCssVariablesResolverForAppearance(DEFAULT_APP_THEME, density);
}
