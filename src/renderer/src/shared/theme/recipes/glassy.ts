import { defaultVariantColorsResolver, type MantineThemeOverride, type VariantColorsResolver } from "@mantine/core";
import type { UiDensity } from "../tokens";
import type { AppTheme } from "../themes";
import { createFluentComponents } from "./fluent";
import { ALERT_TONE_TOKENS, alertToneForColor } from "./alertTone";
import {
  contentMaterialStyles,
  controlMaterialStyles,
  overlayDialogMaterialStyles,
  overlayMaterialStyles,
} from "./materialSurface";

/**
 * Glassy filled primaries use the family's accent fill with `blueContrast` as
 * the label, so Glassy Dark can keep dark ink on the bright cyan solid.
 * Semantic filled actions stay on Mantine autoContrast.
 */
export const glassyVariantColorsResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  const isAccent = input.color === undefined || input.color === "blue";
  if (input.variant === "filled" && isAccent) {
    return {
      ...resolved,
      background: "var(--app-color-accent)",
      hover: "var(--app-color-accent-hover)",
      color: "var(--app-color-accent-contrast)",
    };
  }
  return resolved;
};

function isGlassButtonVariant(variant: string | undefined): boolean {
  return (
    variant === "default" ||
    variant === "light" ||
    variant === "outline" ||
    variant === "subtle" ||
    variant === "transparent"
  );
}

/** ActionIcon defaults to `subtle`; Button defaults to `filled`. */
function isGlassActionIconVariant(variant: string | undefined): boolean {
  return variant === undefined || isGlassButtonVariant(variant);
}

/**
 * Glassy component recipes (#PUX-005-A).
 *
 * Compose Fluent and frost the surfaces the mockup treats as glass: cards,
 * papers, idle buttons, inputs, menus and dialogs. Filled primaries stay solid
 * cyan. Feature CSS keeps reading `--app-*` roles; recipes own `--app-material-*`.
 */
export function createGlassyComponents(density: UiDensity, theme: AppTheme): MantineThemeOverride["components"] {
  const fluent = createFluentComponents(density, theme) ?? {};

  return {
    ...fluent,
    NavLink: {
      ...fluent.NavLink,
      styles: {
        ...fluent.NavLink?.styles,
        root: {
          "--nl-bg": "transparent",
          "--nl-hover": "color-mix(in srgb, var(--app-color-accent) 6%, transparent)",
          "--nl-color": "var(--app-color-muted)",
        },
      },
    },
    Alert: {
      ...fluent.Alert,
      styles: {
        ...fluent.Alert?.styles,
        root: {
          backdropFilter: "var(--app-material-content-filter)",
          WebkitBackdropFilter: "var(--app-material-content-filter)",
          boxShadow: "inset 0 1px 0 var(--app-material-inner-highlight)",
        },
        icon: { color: "var(--alert-icon-color)" },
      },
      vars: (_mantineTheme: unknown, props: { color?: string | undefined }) => {
        const color = typeof props.color === "string" ? props.color : "blue";
        const toneToken = ALERT_TONE_TOKENS[alertToneForColor(color)];
        if (toneToken === undefined) {
          return { root: {} };
        }
        return {
          root: {
            /* Glass plate + light severity tint — not a muddy opaque wash. */
            "--alert-bg": `color-mix(in srgb, var(--app-material-content-bg) 82%, ${toneToken})`,
            "--alert-bd": `1px solid color-mix(in srgb, ${toneToken} 55%, transparent)`,
            "--alert-color": "var(--app-color-text)",
            "--alert-icon-color": toneToken,
          },
        };
      },
    },
    Card: {
      ...fluent.Card,
      styles: {
        ...fluent.Card?.styles,
        root: contentMaterialStyles,
      },
    },
    Paper: {
      ...fluent.Paper,
      styles: {
        ...fluent.Paper?.styles,
        root: contentMaterialStyles,
      },
    },
    Button: {
      ...fluent.Button,
      vars: (_mantineTheme: unknown, props: { variant?: string | undefined }) =>
        isGlassButtonVariant(props.variant)
          ? {
              root: {
                "--button-bg": "var(--app-material-raised-bg)",
                "--button-hover": "color-mix(in srgb, var(--app-color-accent) 22%, var(--app-material-raised-bg))",
                "--button-bd": "1px solid var(--app-color-border-subtle)",
              },
            }
          : { root: {} },
      styles: (_mantineTheme: unknown, props: { variant?: string | undefined }) =>
        isGlassButtonVariant(props.variant) ? { root: controlMaterialStyles } : {},
    },
    ActionIcon: {
      ...fluent.ActionIcon,
      vars: (_mantineTheme: unknown, props: { variant?: string | undefined }) =>
        isGlassActionIconVariant(props.variant)
          ? {
              root: {
                "--ai-bg": "var(--app-material-raised-bg)",
                "--ai-hover": "color-mix(in srgb, var(--app-color-accent) 18%, var(--app-material-raised-bg))",
                "--ai-bd": "1px solid var(--app-color-border-subtle)",
              },
            }
          : { root: {} },
      styles: (_mantineTheme: unknown, props: { variant?: string | undefined }) =>
        isGlassActionIconVariant(props.variant) ? { root: controlMaterialStyles } : {},
    },
    Input: {
      ...fluent.Input,
      styles: {
        ...fluent.Input?.styles,
        input: {
          ...controlMaterialStyles,
          backgroundColor: "var(--app-material-raised-bg)",
        },
      },
    },
    Tabs: {
      ...fluent.Tabs,
      styles: {
        ...fluent.Tabs?.styles,
        tab: {
          color: "var(--app-color-muted)",
          fontWeight: 650,
          "&[data-active]": {
            color: "var(--app-color-text)",
            borderColor: "var(--app-color-accent)",
            background: "color-mix(in srgb, var(--app-color-accent) 6.5%, transparent)",
          },
        },
        list: {
          borderColor: "var(--app-color-border-subtle)",
        },
      },
    },
    Progress: {
      ...fluent.Progress,
      defaultProps: {
        ...fluent.Progress?.defaultProps,
        size: 7,
        radius: "xl",
      },
    },
    Switch: {
      ...fluent.Switch,
      styles: {
        ...fluent.Switch?.styles,
        track: {
          borderColor: "var(--app-color-border)",
        },
      },
    },
    Badge: {
      ...fluent.Badge,
      vars: (mantineTheme: unknown, props: { color?: string | undefined }) => {
        const fluentBadge = fluent.Badge?.vars;
        const resolved =
          typeof fluentBadge === "function" ? fluentBadge(mantineTheme as never, props) : { root: {} };
        const semantic = props.color !== undefined && props.color !== "gray";
        if (!semantic) {
          return resolved;
        }
        return {
          root: {
            ...resolved.root,
            "--badge-bd": "1px solid color-mix(in srgb, var(--badge-color) 28%, transparent)",
          },
        };
      },
    },
    SegmentedControl: {
      ...fluent.SegmentedControl,
      styles: {
        ...fluent.SegmentedControl?.styles,
        root: {
          ...controlMaterialStyles,
          backgroundColor: "var(--app-material-raised-bg)",
        },
        indicator: {
          boxShadow: "var(--app-elevation-2), inset 0 1px 0 var(--app-material-inner-highlight)",
        },
      },
    },
    Menu: {
      ...fluent.Menu,
      styles: {
        ...fluent.Menu?.styles,
        dropdown: {
          ...overlayMaterialStyles,
          "--menu-item-hover": "color-mix(in srgb, var(--app-color-accent) 14%, transparent)",
        },
      },
    },
    Popover: {
      ...fluent.Popover,
      styles: {
        ...fluent.Popover?.styles,
        dropdown: overlayMaterialStyles,
      },
    },
    Combobox: {
      ...fluent.Combobox,
      styles: {
        ...fluent.Combobox?.styles,
        dropdown: overlayMaterialStyles,
      },
    },
    Tooltip: {
      ...fluent.Tooltip,
      styles: {
        ...fluent.Tooltip?.styles,
        tooltip: overlayMaterialStyles,
      },
    },
    Modal: {
      ...fluent.Modal,
      styles: {
        ...fluent.Modal?.styles,
        overlay: {
          backgroundColor: "var(--app-material-scrim)",
        },
        content: overlayDialogMaterialStyles,
        body: {
          backgroundColor: "transparent",
        },
      },
    },
    Drawer: {
      ...fluent.Drawer,
      styles: {
        ...fluent.Drawer?.styles,
        overlay: {
          backgroundColor: "var(--app-material-scrim)",
        },
        content: overlayDialogMaterialStyles,
      },
    },
  };
}
