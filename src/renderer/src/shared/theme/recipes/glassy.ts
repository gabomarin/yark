import { defaultVariantColorsResolver, type MantineThemeOverride, type VariantColorsResolver } from "@mantine/core";
import type { UiDensity } from "../tokens";
import type { AppTheme } from "../themes";
import { createFluentComponents } from "./fluent";
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
          "--nl-hover": "color-mix(in srgb, var(--app-color-accent) 12%, transparent)",
          "--nl-color": "var(--app-color-text)",
        },
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
                "--button-bg": "var(--app-material-content-bg)",
                "--button-hover": "color-mix(in srgb, var(--app-color-accent) 16%, var(--app-material-content-bg))",
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
                "--ai-bg": "var(--app-material-content-bg)",
                "--ai-hover": "color-mix(in srgb, var(--app-color-accent) 16%, var(--app-material-content-bg))",
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
          backgroundColor: "var(--app-material-content-bg)",
        },
      },
    },
    SegmentedControl: {
      ...fluent.SegmentedControl,
      styles: {
        ...fluent.SegmentedControl?.styles,
        root: {
          ...controlMaterialStyles,
          backgroundColor: "var(--app-material-content-bg)",
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
