export const radixPalette = {
  background: "#0c1427",
  blue: [
    "#061232",
    "#06143c",
    "#081f61",
    "#122c6f",
    "#1d387c",
    "#274489",
    "#335197",
    "#4160a8",
    "#4c6db5",
    "#3f5fa6",
    "#90b5ff",
    "#cde2ff",
  ],
  blueAlpha: [
    "#0000ff0d",
    "#0014fe19",
    "#003cfe45",
    "#1e5cff55",
    "#376ffd65",
    "#477eff74",
    "#5789fe85",
    "#6493fe99",
    "#6e9bffa8",
    "#6394ff96",
    "#90b5ff",
    "#cde2ff",
  ],
  gray: [
    "#000000",
    "#121213",
    "#1f1f1f",
    "#282829",
    "#303030",
    "#39393b",
    "#484849",
    "#5f5f61",
    "#6e6e6f",
    "#7b7b7c",
    "#b4b4b5",
    "#eeeef0",
  ],
  grayAlpha: [
    "#00000000",
    "#f2f2ff13",
    "#ffffff1f",
    "#f9f9ff29",
    "#ffffff30",
    "#f7f7ff3b",
    "#fcfcff49",
    "#fafaff61",
    "#fdfdff6f",
    "#fdfdff7c",
    "#fefeffb5",
    "#fdfdfff0",
  ],
} as const;

export const appTokens = {
  colors: {
    bg: radixPalette.background,
    bgAccent: radixPalette.gray[1],
    panel: radixPalette.gray[2],
    panelAlt: radixPalette.gray[3],
    border: radixPalette.gray[5],
    text: radixPalette.gray[11],
    muted: radixPalette.gray[10],
    accent: radixPalette.blue[8],
    ok: "#58c89a",
    warn: "#d9a85f",
    /** Needs-attention UI (update pending, card rail). */
    attention: "#E6ED62",
    bad: "#ef7070",
    cryo: radixPalette.blue[10],
    biomass: "#58c89a",
    fossil: "#d9a85f",
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    /** Inputs, list rows, search — tighter than card `md`. */
    control: 12,
  },
  /**
   * Spacing scale (px). Prefer these over raw px in CSS modules.
   * Mantine `gap` / `padding` keys (`xs`…`xl`) map to the same values via theme.
   * Off-grid leftovers (6, 10, 14) → snap to nearest step when touching a file.
   */
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  shadows: {
    panel: "0 1px 0 rgba(255, 255, 255, 0.025)",
  },
} as const;
