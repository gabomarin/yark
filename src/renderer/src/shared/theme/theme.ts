import { createTheme } from "@mantine/core";
import { appTokens } from "./tokens";

export const appTheme = createTheme({
  primaryColor: "blue",
  primaryShade: 5,
  fontFamily: '"Segoe UI Variable", "Aptos", "Trebuchet MS", sans-serif',
  defaultRadius: "md",
  /** Más allá de `xs` (~12px): usar en cards densas / meta labels. */
  fontSizes: {
    xxs: "11px",
    micro: "9px",
  },
  colors: {
    blue: [
      "#eef6ff",
      "#d9eaff",
      "#b7d7ff",
      "#8ec1ff",
      "#69acff",
      appTokens.colors.accent,
      "#3f8de0",
      "#2f6cab",
      "#1f4a75",
      "#10283f",
    ],
  },
  components: {
    AppShell: {
      defaultProps: {
        padding: 0,
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
      },
    },
  },
});