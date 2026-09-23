import type { ReactElement } from "react";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { createContext, useContext, useLayoutEffect, useMemo, type PropsWithChildren } from "react";
import { createAppCssVariablesResolverForAppearance, createAppThemeForAppearance } from "@theme/theme";
import { resolveThemeSelection } from "@theme/themes";
import type { UiDensity } from "@theme/tokens";
import {
  DEFAULT_WORKSPACE_PANELS_OPTION,
  resolveWorkspacePanelsOption,
  type WorkspacePanelsOption,
} from "@shared/workspace/workspacePanels";
import type { ThemeSelection, WorkspacePanelsId } from "@shared/settings/appearance";
import { RowActionMenuProvider } from "@ui/RowActionMenu/RowActionMenuProvider";
import { isRendererTest } from "@renderer/shared/isRendererTest";

const UiDensityContext = createContext<UiDensity>("compact");

export function useUiDensity(): UiDensity {
  return useContext(UiDensityContext);
}

const WorkspacePanelsContext = createContext<WorkspacePanelsOption>(DEFAULT_WORKSPACE_PANELS_OPTION);

/** How the server workspace arranges its panels (Settings → Appearance). */
export function useWorkspacePanels(): WorkspacePanelsOption {
  return useContext(WorkspacePanelsContext);
}

interface Props extends PropsWithChildren {
  /** Compact (default) or Comfortable. */
  density?: UiDensity;
  /** Appearance family + scheme. Unknown selections fall back to the shipped family/scheme. */
  themeSelection?: ThemeSelection | null;
  /** Server-workspace panels option. Unknown ids fall back to Auto. */
  workspacePanels?: WorkspacePanelsId | string | null;
}

export function AppProviders({
  children,
  density = "compact",
  themeSelection = null,
  workspacePanels = null,
}: Props): ReactElement {
  const appearance = useMemo(() => resolveThemeSelection(themeSelection), [themeSelection]);
  const panels = useMemo(() => resolveWorkspacePanelsOption(workspacePanels), [workspacePanels]);
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
      <WorkspacePanelsContext.Provider value={panels}>
        {/*
          `forceColorScheme`, not `defaultColorScheme`: the latter only seeds the
          first mount, so a theme whose scheme differs from the mounted one would
          swap the palette and keep the old scheme (and a stale Mantine-stored
          scheme could override the stored preference). If a later slice lets the
          operator follow the OS scheme, this moves to the scheme manager.
        */}
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          forceColorScheme={appearance.colorScheme}
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
      </WorkspacePanelsContext.Provider>
    </UiDensityContext.Provider>
  );
}
