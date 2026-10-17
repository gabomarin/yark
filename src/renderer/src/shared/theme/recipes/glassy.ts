import { defaultVariantColorsResolver, type MantineThemeOverride, type VariantColorsResolver } from "@mantine/core";
import type { UiDensity } from "../tokens";
import type { AppTheme } from "../themes";
import { createFluentComponents } from "./fluent";
import { overlayDialogMaterialStyles, overlayMaterialStyles } from "./materialSurface";

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

/**
 * Glassy component recipes (#PUX-005-A).
 *
 * Compose Fluent and override only surfaces whose material behavior changes:
 * transparent idle nav on chrome, stable opaque controls, and one overlay
 * material on menus / popovers / dialogs / dropdowns. Routine cards stay on
 * the Fluent (opaque) Card recipe.
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
          "--nl-hover": "var(--app-color-surface-control-hover)",
          "--nl-color": "var(--app-color-text)",
        },
      },
    },
    Input: {
      ...fluent.Input,
      styles: {
        ...fluent.Input?.styles,
        input: {
          backgroundColor: "var(--app-color-surface-control)",
          borderColor: "var(--app-color-border-control)",
          boxShadow: "inset 0 1px 0 var(--app-material-inner-highlight)",
        },
      },
    },
    SegmentedControl: {
      ...fluent.SegmentedControl,
      styles: {
        ...fluent.SegmentedControl?.styles,
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
          "--menu-item-hover": "var(--app-color-surface-control-hover)",
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
        tooltip: {
          backgroundColor: "var(--app-material-overlay-fallback)",
          border: "1px solid var(--app-color-border-subtle)",
        },
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
          backgroundColor: "var(--app-material-content-fallback)",
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
