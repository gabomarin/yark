import type { MantineThemeOverride } from "@mantine/core";
import type { UiDensity } from "../tokens";
import type { AppTheme } from "../themes";
import { ALERT_TONE_TOKENS, alertToneForColor } from "./alertTone";

/**
 * Fluent 2 component recipes (#PUX-004, extracted #PUX-005-B).
 *
 * The shared, family-agnostic base: every family starts from this set and only
 * overrides the components where its own language genuinely differs. Semantic
 * roles (`--app-*`) stay shared; only chrome shapes and weights live here.
 */
export function createFluentComponents(density: UiDensity, theme: AppTheme): MantineThemeOverride["components"] {
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
        ...(props.color === undefined
          ? {
              "--sc-color":
                theme.colorScheme === "light" ? "var(--ark-gray-1)" : "var(--app-color-surface-control-hover)",
            }
          : {}),
        "--sc-shadow": "var(--app-elevation-2)",
      },
    }),
    styles: {
      root: {
        /*
         * Fluent TabList track: a control surface, not a panel step. On a light
         * panel `panel-raised` sits 1.07 from the surface, so the whole control
         * read as a disabled input.
         */
        backgroundColor:
          theme.colorScheme === "light" ? "var(--app-color-surface-control)" : "var(--app-color-panel-raised)",
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

  return {
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
    /* Fluent dialogs are 8px; lives here (not ModalsProvider) so Breeze can override. */
    Modal: {
      defaultProps: {
        radius: "md",
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
          fontWeight: theme.typography.labelWeight,
        },
        description: {
          fontSize: "var(--app-form-description-size)",
          lineHeight: theme.typography.bodyLineHeight,
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
  };
}
