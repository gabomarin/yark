import type {
  AppThemeColors,
  AppThemeContrast,
  AppThemeMaterials,
  AppThemePalette,
  AppThemeRamp,
  AppThemeShadows,
} from "./tokens";

/**
 * Glassy family tokens.
 *
 * ARK-cyan frost. The opacity ladder is the PoC's: chrome is more open, content
 * panels are milkier, raised controls are denser. Dark is teal-navy with accent
 * `#28d4ec` and a dark label; Light is milky teal glass on the same hue,
 * darkened so white labels and accent text clear a light sheet. Semantic status tones
 * stay on the Fluent values the registry already ships. Materials are the flat
 * `--app-*` strings, not a family selector.
 */

const glassyDarkBlue: AppThemeRamp = [
  "#03151c",
  "#042028",
  "#063445",
  "#0a4d63",
  "#0d6884",
  "#1285a6",
  "#16a8c9",
  "#1dc0dc",
  "#28d4ec",
  "#51e3f4",
  "#7aedf8",
  "#c5f6fb",
];

const glassyDarkBlueAlpha: AppThemeRamp = [
  "#28d4ec0f",
  "#28d4ec1f",
  "#28d4ec33",
  "#28d4ec45",
  "#28d4ec59",
  "#28d4ec6e",
  "#28d4ec85",
  "#28d4ec99",
  "#28d4eca8",
  "#28d4ec96",
  "#7aedf8",
  "#c5f6fb",
];

const glassyLightBlue: AppThemeRamp = [
  "#e7faf6",
  "#d0f4ec",
  "#b3e9dc",
  "#8dd9c8",
  "#62c4b2",
  "#3aab98",
  "#229684",
  "#188674",
  "#14786f",
  "#0f665e",
  "#0b534c",
  "#083e39",
];

const glassyLightBlueAlpha: AppThemeRamp = [
  "#14786f0a",
  "#14786f12",
  "#14786f24",
  "#14786f33",
  "#14786f42",
  "#14786f52",
  "#14786f66",
  "#14786f80",
  "#14786f99",
  "#14786f8c",
  "#0b534ccc",
  "#083e39f2",
];

const glassyDarkGray: AppThemeRamp = [
  "#041017",
  "#0e2430",
  "#173e50",
  "#123140",
  "#23586e",
  "#1c4d60",
  "#3d6a78",
  "#4d7d8c",
  "#638692",
  "#7a9eaa",
  "#a8cdd9",
  "#e8f8fb",
];

const glassyDarkGrayAlpha: AppThemeRamp = [
  "#ffffff00",
  "#ffffff10",
  "#ffffff1c",
  "#ffffff26",
  "#ffffff33",
  "#ffffff40",
  "#ffffff52",
  "#ffffff66",
  "#ffffff80",
  "#ffffff9e",
  "#fffffff0",
  "#ffffff",
];

const glassyLightGray: AppThemeRamp = [
  "#ffffff",
  "#e6f6f1",
  "#f3fbf8",
  "#f7fdfb",
  "#eaf7f3",
  "#dff3ec",
  "#6f9e94",
  "#5f8f85",
  "#4f7f76",
  "#456f68",
  "#3e6a62",
  "#123833",
];

const glassyLightGrayAlpha: AppThemeRamp = [
  "#12383300",
  "#12383305",
  "#1238330a",
  "#12383312",
  "#1238331c",
  "#12383329",
  "#12383338",
  "#1238334d",
  "#12383366",
  "#1238339e",
  "#123833e6",
  "#123833f5",
];

export const glassyDarkPalette: AppThemePalette = {
  background: "#06131b",
  blue: glassyDarkBlue,
  blueAlpha: glassyDarkBlueAlpha,
  gray: glassyDarkGray,
  grayAlpha: glassyDarkGrayAlpha,
  /** Dark ink on the ARK cyan solid. */
  blueContrast: "#03151c",
  blueSurface: "#28d4ec1f",
  grayContrast: "#e8f8fb",
  graySurface: "rgba(0, 0, 0, 0.05)",
};

export const glassyLightPalette: AppThemePalette = {
  background: "#e3f4ee",
  blue: glassyLightBlue,
  blueAlpha: glassyLightBlueAlpha,
  gray: glassyLightGray,
  grayAlpha: glassyLightGrayAlpha,
  /** White on the deepened teal. A dark label fails the solid accent. */
  blueContrast: "#ffffff",
  blueSurface: "#14786f1a",
  grayContrast: "#123833",
  graySurface: "rgba(18, 56, 51, 0.04)",
};

/**
 * Status tones on the dark frost. Filled buttons and menu items (the server
 * kebab's Delete) share Breeze's crimson `#da4453`. Light keeps Fluent's
 * semantics: those already clear a near-white sheet.
 */
export const glassyDarkColors: AppThemeColors = {
  ok: "#58c89a",
  warn: "#f2c94c",
  attention: "#f2c94c",
  bad: "#da4453",
  dangerBright: "#da4453",
  biomass: "#58c89a",
  fossil: "#d9a85f",
  fossilFilled: "#C2610A",
};

export const glassyDarkShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(218,250,255,.28), inset 0 -1px 0 rgba(0,0,0,.14), 0 8px 28px rgba(0,0,0,.18)",
  elevation2: "0 2px 8px rgba(0,0,0,.14), inset 0 1px 0 rgba(218,250,255,.12)",
  elevation4: "inset 0 1px 0 rgba(218,250,255,.28), inset 0 -1px 0 rgba(0,0,0,.14), 0 8px 28px rgba(0,0,0,.18)",
  elevation8: "inset 0 1px 0 rgba(218,250,255,.28), 0 10px 26px rgba(0,0,0,.18)",
  elevation16: "inset 0 1px 0 rgba(225,250,255,.32), 0 14px 34px rgba(0,0,0,.22)",
  elevation28: "inset 0 1px 0 rgba(225,250,255,.32), 0 18px 40px rgba(0,0,0,.26)",
};

export const glassyLightShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(255,255,255,.84), inset 0 -1px 0 rgba(20,90,78,.10), 0 8px 24px rgba(16,70,60,.10)",
  elevation2: "0 2px 8px rgba(16,70,60,.08), inset 0 1px 0 rgba(255,255,255,.42)",
  elevation4: "inset 0 1px 0 rgba(255,255,255,.84), inset 0 -1px 0 rgba(20,90,78,.10), 0 8px 24px rgba(16,70,60,.10)",
  elevation8: "inset 0 1px 0 rgba(255,255,255,.88), 0 10px 26px rgba(16,70,60,.10)",
  elevation16: "inset 0 1px 0 rgba(255,255,255,.94), 0 14px 30px rgba(16,70,60,.12)",
  elevation28: "inset 0 1px 0 rgba(255,255,255,.94), 0 18px 40px rgba(16,70,60,.14)",
};

function glassyMaterials(input: {
  chromeBg: string;
  panelBg: string;
  raisedBg: string;
  borderSubtle: string;
  border: string;
  borderControl: string;
  listSelectedBg: string;
  listSelectedInset: string;
  shellAtmosphere: string;
  listVesselShadow: string;
  sidebarFooterBorder: string;
  sidebarFooterMargin: string;
  sidebarFooterPadding: string;
  sidebarFooterRadius: string;
  sidebarFooterBg: string;
  sidebarFooterFilter: string;
  versionChipPaddingTop: string;
  brandLightPadding: string;
  brandLightRadius: string;
  brandLightFlex: string;
  inputWellBg: string;
  menuBg: string;
  attentionLight: string;
  attentionLightHover: string;
  listVesselBg: string;
  tableHeadBg: string;
  iconButtonShadow: string;
  primaryButtonBg: string;
  primaryButtonHover: string;
  /** Light uses a mint plate. Dark keeps the raised frost. */
  iconButtonBg?: string;
  iconButtonDefaultBg?: string;
}): AppThemeMaterials {
  return {
    surfaceFilter: "blur(26px) saturate(155%)",
    chromeFilter: "blur(22px) saturate(150%)",
    raisedFilter: "blur(14px) saturate(140%)",
    chromeBg: input.chromeBg,
    surfaceChromeBg: input.chromeBg,
    panelBg: input.panelBg,
    panelRaisedBg: input.raisedBg,
    panelAltBg: input.raisedBg,
    borderSubtle: input.borderSubtle,
    border: input.border,
    borderControl: input.borderControl,
    contentPaneBg: input.panelBg,
    contentPaneBorder: "1px solid var(--app-color-border-subtle)",
    contentPaneShadow: "var(--app-shadow-panel)",
    contentPaneRadius: "var(--app-radius-md)",
    panelRadius: "var(--app-radius-md)",
    tabAttachedRadius: "0 0 var(--app-panel-radius) var(--app-panel-radius)",
    metricGap: "var(--app-space-sm)",
    collectionGap: "var(--app-space-sm)",
    collectionRadius: "var(--app-radius-sm)",
    collectionJoin: "1px",
    collectionFuse: "0px",
    collectionItemBorder: "1px solid var(--app-color-border)",
    collectionStripFill: "transparent",
    collectionItemShadow: "var(--app-shadow-panel)",
    contentPanePadding: "var(--app-space-sm)",
    shellGrainOpacity: "0",
    chromeBorder: "color-mix(in srgb, var(--app-color-accent) 34%, transparent)",
    navSelectedBorder: "1px solid var(--app-color-border)",
    navSelectedShadow: "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px color-mix(in srgb, var(--app-color-accent) 16%, transparent)",
    surfaceHover: "color-mix(in srgb, var(--app-color-accent) 18%, var(--app-color-panel-raised))",
    splitGap: "var(--app-space-sm)",
    splitPadding: "var(--app-space-md)",
    splitRailBorder: "1px solid var(--app-color-border-subtle)",
    splitRailShadow: "var(--app-shadow-panel)",
    splitPanelMax: "none",
    splitPanelMargin: "0",
    settingStackBorder: "1px solid var(--app-color-border-subtle)",
    settingStackBg: "var(--app-raised-surface-bg)",
    settingStackClip: "hidden",
    settingRowBg: "transparent",
    settingRowBorder: "none",
    settingRowJoin: "0px",
    settingRowEdge: "1px solid var(--app-color-border-subtle)",
    sidebarEdge: "color-mix(in srgb, var(--app-color-accent) 45%, transparent)",
    sidebarEdgeGlow: "none",
    sidebarFooterBorder: input.sidebarFooterBorder,
    sidebarFooterMargin: input.sidebarFooterMargin,
    sidebarFooterPadding: input.sidebarFooterPadding,
    sidebarFooterRadius: input.sidebarFooterRadius,
    sidebarFooterBg: input.sidebarFooterBg,
    sidebarFooterFilter: input.sidebarFooterFilter,
    versionChipPaddingTop: input.versionChipPaddingTop,
    brandLightPadding: input.brandLightPadding,
    brandLightRadius: input.brandLightRadius,
    brandLightFlex: input.brandLightFlex,
    inputWellBg: input.inputWellBg,
    menuBg: input.menuBg,
    attentionLight: input.attentionLight,
    attentionLightHover: input.attentionLightHover,
    iconButtonBg: input.iconButtonBg ?? "var(--app-raised-surface-bg)",
    iconButtonBorder: "1px solid var(--app-color-border-subtle)",
    iconButtonDefaultBg: input.iconButtonDefaultBg ?? "var(--app-raised-surface-bg)",
    iconButtonDefaultBorder: "1px solid var(--app-color-border-subtle)",
    iconButtonFilter: "var(--app-surface-raised-filter)",
    iconButtonShadow: input.iconButtonShadow,
    primaryButtonBg: input.primaryButtonBg,
    primaryButtonHover: input.primaryButtonHover,
    primaryButtonBorder: "1px solid var(--app-color-border-subtle)",
    /**
     * Disabled controls stay flat (no blur, no inset highlight) but thinner than
     * the solid grey, so Restart and an up-to-date Install recede next to Start.
     */
    buttonDisabledBg: "color-mix(in srgb, var(--mantine-color-disabled) 58%, transparent)",
    buttonDisabledQuietBg: "var(--app-button-disabled-bg)",
    navLinkColor: "var(--app-color-muted)",
    listVesselBorder: "1px solid var(--app-color-border-subtle)",
    listVesselBg: input.listVesselBg,
    listVesselShadow: input.listVesselShadow,
    listRowBorder: "none",
    listRowJoin: "0px",
    listRowEdge: "1px solid var(--app-color-border-subtle)",
    listRowHover: "color-mix(in srgb, var(--app-color-accent) 10%, transparent)",
    tableHeadBg: input.tableHeadBg,
    queueSectionPadding: "var(--app-space-sm)",
    queueGroupGap: "0px",
    queueGroupRule: "1px solid var(--app-color-border-subtle)",
    queueRowHover: "color-mix(in srgb, var(--app-color-accent) 9%, transparent)",
    serverListHover: "color-mix(in srgb, var(--app-color-accent) 8%, transparent)",
    serverListSelectedBorder: "color-mix(in srgb, var(--app-color-accent) 22%, transparent)",
    shellMainBg: "transparent",
    shellAtmosphere: input.shellAtmosphere,
    listRowBg: "transparent",
    navSelectedFill: "var(--app-list-selected-bg)",
    navSelectedNotch: "0px",
    listSelectedBg: input.listSelectedBg,
    listSelectedInset: input.listSelectedInset,
    raisedBg: input.raisedBg,
    raisedBorder: "1px solid var(--app-color-border-subtle)",
    raisedShadow: "var(--app-shadow-panel)",
  };
}

export const glassyDarkMaterials: AppThemeMaterials = glassyMaterials({
  chromeBg: "rgba(18,56,74,0.70)",
  panelBg: "rgba(32,72,90,0.68)",
  raisedBg: "rgba(46,88,108,0.88)",
  borderSubtle: "rgba(95, 197, 220, 0.22)",
  border: "rgba(95, 197, 220, 0.38)",
  borderControl: "rgba(71, 220, 242, 0.55)",
  listSelectedBg: "rgba(40, 212, 236, 0.13)",
  listSelectedInset:
    "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px rgba(40, 212, 236, 0.16), 0 0 16px rgba(40, 212, 236, 0.10)",
  shellAtmosphere:
    "radial-gradient(circle at 12% 0%, rgba(40, 212, 236, 0.10), transparent 34%), radial-gradient(circle at 100% 0%, rgba(105, 186, 255, 0.05), transparent 40%)",
  listVesselShadow: "inset 0 1px 0 rgba(218, 250, 255, 0.08)",
  sidebarFooterBorder: "1px solid color-mix(in srgb, var(--app-color-border) 18%, transparent)",
  sidebarFooterMargin: "var(--app-space-xxs)",
  sidebarFooterPadding: "var(--app-space-sm)",
  sidebarFooterRadius: "0px",
  sidebarFooterBg: "transparent",
  sidebarFooterFilter: "none",
  versionChipPaddingTop: "var(--app-space-xs)",
  brandLightPadding: "0px",
  brandLightRadius: "0px",
  brandLightFlex: "1",
  /** PoC path well: the dark chrome step, not the lighter raised frost. */
  inputWellBg: "color-mix(in srgb, var(--ark-gray-2) 72%, transparent)",
  /** One step under today's flyout (the control fill) so the menu reads above the card. */
  menuBg: "color-mix(in srgb, var(--app-color-surface-control) 72%, black)",
  /** A light gold veil. The cyan glass shows through; a black mix painted a brown slab. */
  attentionLight: "color-mix(in srgb, var(--app-color-attention) 12%, transparent)",
  attentionLightHover: "color-mix(in srgb, var(--app-color-attention) 20%, transparent)",
  /** A notch under the raised frost. The darker navy inset read as a heavy step. */
  listVesselBg: "rgba(42, 84, 102, 0.86)",
  tableHeadBg: "color-mix(in srgb, var(--app-color-panel-raised) 72%, transparent)",
  iconButtonShadow: "inset 0 1px 0 rgba(218, 250, 255, 0.28)",
  /** Dark ink stays readable; 72% still lets the glass show through the accent. */
  primaryButtonBg: "color-mix(in srgb, var(--app-color-accent) 72%, transparent)",
  primaryButtonHover: "color-mix(in srgb, var(--app-color-accent) 86%, transparent)",
});

export const glassyLightMaterials: AppThemeMaterials = glassyMaterials({
  chromeBg: "rgba(255,255,255,0.74)",
  panelBg: "rgba(255,255,255,0.88)",
  raisedBg: "rgba(255,255,255,0.96)",
  borderSubtle: "rgba(20, 120, 108, 0.30)",
  border: "rgba(18, 110, 98, 0.46)",
  borderControl: "rgba(15, 118, 106, 0.55)",
  listSelectedBg: "rgba(20, 150, 130, 0.12)",
  listSelectedInset:
    "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px rgba(20, 150, 130, 0.14), 0 0 14px rgba(20, 150, 130, 0.08)",
  shellAtmosphere:
    "radial-gradient(circle at 14% 10%, rgba(20, 168, 148, 0.14), transparent 28%), radial-gradient(circle at 86% 18%, rgba(40, 180, 140, 0.10), transparent 24%)",
  listVesselShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.55)",
  sidebarFooterBorder: "none",
  sidebarFooterMargin: "var(--app-space-xs)",
  sidebarFooterPadding: "var(--app-space-xs)",
  sidebarFooterRadius: "var(--app-radius-sm)",
  sidebarFooterBg: "color-mix(in srgb, var(--app-color-panel-raised) 55%, transparent)",
  sidebarFooterFilter: "var(--app-surface-raised-filter)",
  versionChipPaddingTop: "var(--app-space-xxs)",
  brandLightPadding: "var(--app-space-xxs)",
  brandLightRadius: "var(--app-radius-md)",
  brandLightFlex: "0 1 auto",
  inputWellBg: "color-mix(in srgb, var(--app-color-text) 5%, white)",
  menuBg: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
  attentionLight:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 14%, transparent), color-mix(in srgb, var(--app-color-attention) 22%, transparent))",
  attentionLightHover:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 22%, transparent), color-mix(in srgb, var(--app-color-attention) 32%, transparent))",
  listVesselBg: "var(--app-raised-surface-bg)",
  tableHeadBg: "color-mix(in srgb, var(--app-color-panel-raised) 72%, transparent)",
  iconButtonShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(14, 80, 70, 0.16)",
  /**
   * Mint glass for idle and default buttons. The raised card stays milky white;
   * a white plate on white hides the sheen.
   */
  iconButtonBg: "rgba(176, 228, 214, 0.50)",
  iconButtonDefaultBg: "rgba(176, 228, 214, 0.50)",
  /**
   * White label on the deepened teal. A 72% veil (the dark recipe) drops that
   * label under 4.5:1 on a light sheet, so the fill stays denser and the gloss
   * comes from the blur and the inset highlight.
   */
  primaryButtonBg: "color-mix(in srgb, var(--app-color-accent) 92%, transparent)",
  primaryButtonHover: "color-mix(in srgb, var(--app-color-accent) 100%, transparent)",
});

export const glassyDarkContrast: AppThemeContrast = {
  accentLabel: 4.5,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  /** Breeze crimson `#da4453` on the lifted panel step. The button is the fill. */
  statusFill: 2.6,
  cardFill: 1.09,
  cardBorder: 1.6,
};

export const glassyLightContrast: AppThemeContrast = {
  accentLabel: 4.5,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.03,
  cardBorder: 1.5,
};
