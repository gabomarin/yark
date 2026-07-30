import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { MantineProvider } from "@mantine/core";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type PropsWithChildren,
} from "react";
import {
  createAppCssVariablesResolverForDensity,
  createAppThemeForDensity,
} from "@theme/theme";
import type { UiDensity } from "@theme/tokens";

const UiDensityContext = createContext<UiDensity>("compact");

export function useUiDensity(): UiDensity {
  return useContext(UiDensityContext);
}

interface Props extends PropsWithChildren {
  /** Compact (default) or Comfortable. */
  density?: UiDensity;
}

export function AppProviders({
  children,
  density = "compact",
}: Props): JSX.Element {
  const theme = useMemo(() => {
    const base = createAppThemeForDensity(density);
    if (process.env.VITEST !== "true") {
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
      },
    };
  }, [density]);
  const cssVariablesResolver = useMemo(
    () => createAppCssVariablesResolverForDensity(density),
    [density],
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

  return (
    <UiDensityContext.Provider value={density}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        defaultColorScheme="dark"
      >
        <ModalsProvider
          modalProps={{ centered: true, radius: "md" }}
          labels={{ confirm: "Confirm", cancel: "Cancel" }}
        >
          <Notifications position="top-right" autoClose={5000} />
          {children}
        </ModalsProvider>
      </MantineProvider>
    </UiDensityContext.Provider>
  );
}
