import { defaultVariantColorsResolver, type MantineThemeOverride, type VariantColorsResolver } from "@mantine/core";
import type { UiDensity } from "../tokens";
import type { AppTheme } from "../themes";
import { createFluentComponents } from "./fluent";

/**
 * KDE Breeze puts a **white** label on the `#3daee9` selection (`[Colors:Selection]`
 * foreground `252,252,252`). Mantine's `autoContrast` uses WCAG luminance and sees
 * `#3daee9` as "light", so it picks black instead, and `--mantine-color-blue-contrast`
 * is only honoured for virtual colors. This resolver restores the Breeze label on the
 * accent's filled variant while leaving every semantic color (fossil/attention/red)
 * on Mantine's autoContrast, which those still need.
 */
export const plasmaBreezeVariantColorsResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  const isAccent = input.color === undefined || input.color === "blue";
  if (input.variant === "filled" && isAccent) {
    return { ...resolved, color: "var(--mantine-color-white)" };
  }
  return resolved;
};

/**
 * Plasma Breeze component recipes (#PUX-005-B).
 *
 * Breeze is Fluent with the chrome flattened: the same component structure, but
 * 4px corners everywhere (menus, popovers and modals drop Fluent's 8px), a flat
 * SegmentedControl with no elevation, and selection/focus carried by the exact
 * KDE accent `#3daee9`. Everything else composes the Fluent base unchanged -
 * only a real visual difference earns an override.
 */
export function createPlasmaBreezeComponents(
  density: UiDensity,
  theme: AppTheme,
): MantineThemeOverride["components"] {
  const fluent = createFluentComponents(density, theme) ?? {};

  return {
    ...fluent,
    /*
     * Breeze line edits: a flat field on the window colour (not a raised control
     * fill), with one hairline in the family's border tone. Light stays white like
     * Breeze's view; dark uses the window `#202326` instead of Fluent's lighter
     * control fill. Focus still takes the accent.
     */
    Input: {
      ...fluent.Input,
      styles: {
        ...fluent.Input?.styles,
        input: {
          backgroundColor: theme.colorScheme === "light" ? "var(--ark-gray-1)" : "var(--ark-gray-2)",
          borderColor: "var(--app-color-border-control)",
        },
      },
    },
    /*
     * Breeze toggle knob: a white circle with its own hairline and a hair of lift,
     * so it reads as a physical knob on the track instead of a flat cut-out.
     */
    Switch: {
      ...fluent.Switch,
      styles: {
        ...fluent.Switch?.styles,
        thumb: {
          border: "1px solid var(--app-color-border-subtle)",
          boxShadow: "var(--app-elevation-2)",
        },
      },
    },
    /* Breeze flyouts and popovers are 4px, not Fluent's 8px. */
    Menu: {
      ...fluent.Menu,
      defaultProps: {
        ...fluent.Menu?.defaultProps,
        radius: "sm",
      },
    },
    Popover: {
      ...fluent.Popover,
      defaultProps: {
        ...fluent.Popover?.defaultProps,
        radius: "sm",
      },
    },
    /* Breeze dialogs are 4px; Fluent's 8px came from ModalsProvider (moved here). */
    Modal: {
      defaultProps: {
        radius: "sm",
      },
    },
    /*
     * Breeze tabs/segments are flat: a 4px track, no raised pill, and the accent
     * (not a neutral step) marks the active segment - the KDE selection language.
     * A call site that encodes meaning with `color` still wins.
     */
    SegmentedControl: {
      ...fluent.SegmentedControl,
      defaultProps: {
        ...fluent.SegmentedControl?.defaultProps,
        radius: "sm",
      },
      vars: (_theme: unknown, props: { color?: string | undefined }) => ({
        root: {
          ...(props.color === undefined ? { "--sc-color": "var(--app-color-accent)" } : {}),
          "--sc-shadow": "none",
        },
      }),
      styles: {
        ...fluent.SegmentedControl?.styles,
        root: {
          backgroundColor: "var(--app-color-surface-control)",
        },
        indicator: {
          boxShadow: "none",
        },
      },
    },
  };
}
