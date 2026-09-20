import type { ReactElement } from "react";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { createContext, useContext, useLayoutEffect, useMemo, type PropsWithChildren } from "react";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "@theme/theme";
import { resolveAppTheme } from "@theme/themes";
import type { UiDensity } from "@theme/tokens";
import { DEFAULT_LAYOUT_PROFILE, resolveLayoutProfile, type LayoutProfile } from "@shared/layout/layoutProfiles";
import type { LayoutProfileId, ThemeId } from "@shared/settings/appearance";
import { RowActionMenuProvider } from "@ui/RowActionMenu/RowActionMenuProvider";
import { isRendererTest } from "@renderer/shared/isRendererTest";

const UiDensityContext = createContext<UiDensity>("compact");

export function useUiDensity(): UiDensity {
  return useContext(UiDensityContext);
}

const LayoutProfileContext = createContext<LayoutProfile>(DEFAULT_LAYOUT_PROFILE);

/** Active layout profile (Settings → Appearance). Unknown ids resolve to the default. */
export function useLayoutProfile(): LayoutProfile {
  return useContext(LayoutProfileContext);
}

interface Props extends PropsWithChildren {
  /** Compact (default) or Comfortable. */
  density?: UiDensity;
  /** Appearance theme id (Settings → Appearance). Unknown ids fall back to dark. */
  themeId?: ThemeId | string | null;
  /** Appearance layout profile id. Unknown ids fall back to Adaptive. */
  layoutProfile?: LayoutProfileId | string | null;
}

export function AppProviders({
  children,
  density = "compact",
  themeId = null,
  layoutProfile = null,
}: Props): ReactElement {
  const appearance = useMemo(() => resolveAppTheme(themeId), [themeId]);
  const layout = useMemo(() => resolveLayoutProfile(layoutProfile), [layoutProfile]);
  const theme = useMemo(() => {
    const base = createAppThemeForAppearance(appearance, density);
    if (!isRendererTest()) {
      return base;
    }
    // jsdom + Floating UI: keep Menu/Select dropdowns mounted inline and
    // skip enter/exit transitions so Testing Library can see options/items.
    return {
      ...base,
      components: {
        ...base.components,
        Transition: {
          defaultProps: { duration: 0, exitDuration: 0 },
        },
        Modal: {
          defaultProps: { transitionProps: { duration: 0 } },
        },
        Drawer: {
          defaultProps: { transitionProps: { duration: 0 } },
        },
        Tooltip: {
          defaultProps: { transitionProps: { duration: 0 } },
        },
        Select: {
          defaultProps: {
            comboboxProps: {
              withinPortal: false,
              transitionProps: { duration: 0 },
            },
          },
        },
        Menu: {
          defaultProps: {
            withinPortal: false,
            transitionProps: { duration: 0 },
          },
        },
        Popover: {
          defaultProps: {
            withinPortal: false,
            transitionProps: { duration: 0 },
            hideDetached: false,
          },
        },
        TimePicker: {
          defaultProps: {
            popoverProps: {
              withinPortal: false,
              transitionProps: { duration: 0 },
            },
          },
        },
      },
    };
  }, [appearance, density]);
  const cssVariablesResolver = useMemo(
    () => createAppCssVariablesResolverForAppearance(appearance, density),
    [appearance, density],
  );

  // On <html> so Mantine portals (Modal/Drawer under document.body) inherit
  // compact input height/padding from globals.css.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.uiDensity = density;
    return () => {
      delete root.dataset.uiDensity;
    };
  }, [density]);

  const notificationsAutoClose = isRendererTest() ? false : 5000;

  return (
    <UiDensityContext.Provider value={density}>
      <LayoutProfileContext.Provider value={layout}>
        {/*
          The scheme is the theme's, but it stays a *default* on purpose: B3 (a light
          theme) has to switch schemes at runtime, and that needs `forceColorScheme`
          or a remount - `defaultColorScheme` only seeds the first mount.
        */}
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          defaultColorScheme={appearance.colorScheme}
        >
          <DatesProvider settings={{ consistentWeeks: true }}>
            <ModalsProvider
              modalProps={{
                centered: true,
                radius: "md",
                ...(isRendererTest() ? { transitionProps: { duration: 0 } } : {}),
              }}
              labels={{ confirm: "Confirm", cancel: "Cancel" }}
            >
              <RowActionMenuProvider>
                <Notifications position="bottom-right" autoClose={notificationsAutoClose} />
                {children}
              </RowActionMenuProvider>
            </ModalsProvider>
          </DatesProvider>
        </MantineProvider>
      </LayoutProfileContext.Provider>
    </UiDensityContext.Provider>
  );
}
