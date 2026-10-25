import type {
  AppThemeColors,
  AppThemeContrast,
  AppThemeMaterials,
  AppThemePalette,
  AppThemeRamp,
  AppThemeShadows,
} from "./tokens";
import hexagonUrl from "./hexagon.svg";
import islandUrl from "./the_island.jpeg";
import islandDarkUrl from "./the_island_dark.png";

/**
 * Glassy family tokens.
 *
 * ARK-cyan frost. The opacity ladder is the PoC's: chrome is more open, content
 * panels are milkier, raised controls are denser. Dark is teal-navy with accent
 * `#28d4ec` and a dark label; Light is neutral milk glass with that same cyan
 * darkened so a white label still clears. Semantic status tones
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
  "#e8f6fb",
  "#d2eef8",
  "#b4e2f3",
  "#8ad0ea",
  "#58b8d8",
  "#2e9cc4",
  "#1786ad",
  "#127a9c",
  "#0c7490",
  "#0a6580",
  "#084556",
  "#062f3c",
];

const glassyLightBlueAlpha: AppThemeRamp = [
  "#0c74900a",
  "#0c749012",
  "#0c749024",
  "#0c749033",
  "#0c749042",
  "#0c749052",
  "#0c749066",
  "#0c749080",
  "#0c749099",
  "#0c74908c",
  "#084556cc",
  "#062f3cf2",
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
  "#e6edf1",
  "#f7f9fb",
  "#f1f4f7",
  "#e3e9ed",
  "#d5dee4",
  "#7d8d98",
  "#6a7b86",
  "#566874",
  "#455763",
  "#24323c",
  "#1c2830",
];

const glassyLightGrayAlpha: AppThemeRamp = [
  "#1c283000",
  "#1c283005",
  "#1c28300a",
  "#1c283012",
  "#1c28301c",
  "#1c283029",
  "#1c283038",
  "#1c28304d",
  "#1c283066",
  "#1c28309e",
  "#1c2830e6",
  "#1c2830f5",
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
  background: "#e8eef2",
  blue: glassyLightBlue,
  blueAlpha: glassyLightBlueAlpha,
  gray: glassyLightGray,
  grayAlpha: glassyLightGrayAlpha,
  /** White on the deepened cyan. A dark label fails the solid accent. */
  blueContrast: "#ffffff",
  blueSurface: "#0c74901a",
  grayContrast: "#1c2830",
  graySurface: "rgba(28, 40, 48, 0.04)",
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
  panel: "inset 0 1px 0 rgba(226, 250, 255, 0.28)",
  elevation2: "0 2px 8px rgba(0,0,0,.14), inset 0 1px 0 rgba(218,250,255,.12)",
  elevation4: "inset 0 1px 0 rgba(218,250,255,.28), inset 0 -1px 0 rgba(0,0,0,.14), 0 8px 28px rgba(0,0,0,.18)",
  elevation8: "inset 0 1px 0 rgba(218,250,255,.28), 0 10px 26px rgba(0,0,0,.18)",
  elevation16: "inset 0 1px 0 rgba(225,250,255,.32), 0 14px 34px rgba(0,0,0,.22)",
  elevation28: "inset 0 1px 0 rgba(225,250,255,.32), 0 18px 40px rgba(0,0,0,.26)",
};

export const glassyLightShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 10px 28px rgba(16, 28, 36, 0.10)",
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
  floatPanelBg: string;
  chipBg: string;
  glassSheen: string;
  glassRim: string;
  /** Page sheet behind cards. More open than the card so the scene shows in the gaps. */
  contentPaneBg: string;
  /** Nested row (Launch flags, and the raised step). One step denser than the card. */
  nestedRowBg: string;
  borderSubtle: string;
  border: string;
  borderControl: string;
  listSelectedBg: string;
  listSelectedInset: string;
  shellAtmosphere: string;
  shellScene: string;
  shellSceneGrid: string;
  shellSceneVeil: string;
  shellSceneFilter: string;
  listVesselShadow: string;
  sidebarFooterBorder: string;
  sidebarFooterMargin: string;
  sidebarFooterPadding: string;
  serverRailBg: string;
  mastBg: string;
  overviewStageBg: string;
  overviewStagePad: string;
  overviewStageBorder: string;
  overviewAsideBg: string;
  sidebarFooterRadius: string;
  sidebarFooterBg: string;
  sidebarFooterFilter: string;
  versionChipPaddingTop: string;
  brandLightPadding: string;
  brandLightRadius: string;
  brandLightFlex: string;
  inputWellBg: string;
  menuBg: string;
  menuShadow: string;
  notificationBg: string;
  notificationShadow: string;
  downloadsConsoleInset: string;
  attentionLight: string;
  attentionLightHover: string;
  listVesselBg: string;
  tableHeadBg: string;
  iconButtonShadow: string;
  primaryButtonBg: string;
  primaryButtonHover: string;
  primaryButtonColor: string;
  tabInactiveBg: string;
  tabActiveBg: string;
  tabActiveHoverBg: string;
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
    floatPanelBg: input.floatPanelBg,
    chipBg: input.chipBg,
    glassSheen: input.glassSheen,
    glassRim: input.glassRim,
    alertFill: "var(--app-panel-surface-bg)",
    nestedRowBg: input.nestedRowBg,
    panelRaisedBg: input.raisedBg,
    panelAltBg: input.raisedBg,
    borderSubtle: input.borderSubtle,
    border: input.border,
    borderControl: input.borderControl,
    contentPaneBg: input.contentPaneBg,
    contentPaneBorder: "1px solid var(--app-color-border-subtle)",
    contentPaneShadow: "var(--app-shadow-panel)",
    contentPaneRadius: "var(--app-radius-md)",
    panelRadius: "var(--app-radius-md)",
    tabAttachedRadius: "0 0 var(--app-panel-radius) var(--app-panel-radius)",
    tabInactiveBg: input.tabInactiveBg,
    tabActiveBg: input.tabActiveBg,
    tabActiveHoverBg: input.tabActiveHoverBg,
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
    navSelectedShadow:
      "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px color-mix(in srgb, var(--app-color-accent) 16%, transparent)",
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
    menuShadow: input.menuShadow,
    notificationBg: input.notificationBg,
    notificationShadow: input.notificationShadow,
    downloadsConsoleInset: input.downloadsConsoleInset,
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
    primaryButtonBorder: "1px solid transparent",
    primaryButtonColor: input.primaryButtonColor,
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
    serverRailBg: input.serverRailBg,
    mastBg: input.mastBg,
    overviewStageBg: input.overviewStageBg,
    overviewStagePad: input.overviewStagePad,
    overviewStageBorder: input.overviewStageBorder,
    overviewAsideBg: input.overviewAsideBg,
    shellMainBg: "transparent",
    shellAtmosphere: input.shellAtmosphere,
    shellScene: input.shellScene,
    shellSceneGrid: input.shellSceneGrid,
    shellSceneVeil: input.shellSceneVeil,
    shellSceneFilter: input.shellSceneFilter,
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
  /** Open sidebar, denser card, denser nested row. */
  chromeBg: "rgba(18,56,74,0.22)",
  panelBg: "rgba(32,72,90,0.40)",
  raisedBg: "rgba(32,72,90,0.56)",
  floatPanelBg: "rgba(32,72,90,0.56)",
  contentPaneBg: "rgba(32,72,90,0.12)",
  nestedRowBg: "rgba(32,72,90,0.56)",
  chipBg: "rgba(46,88,108,0.30)",
  glassSheen: "linear-gradient(180deg, rgba(214, 248, 255, 0.10) 0%, rgba(214, 248, 255, 0.03) 14%, transparent 32%)",
  glassRim: "inset 0 1px 0 rgba(226, 250, 255, 0.28)",
  borderSubtle: "rgba(95, 197, 220, 0.22)",
  border: "rgba(95, 197, 220, 0.38)",
  borderControl: "rgba(71, 220, 242, 0.55)",
  listSelectedBg: "rgba(40, 212, 236, 0.13)",
  listSelectedInset:
    "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px rgba(40, 212, 236, 0.16), 0 0 16px rgba(40, 212, 236, 0.10)",
  shellAtmosphere:
    "radial-gradient(circle at 12% 0%, rgba(40, 212, 236, 0.10), transparent 34%), radial-gradient(circle at 100% 0%, rgba(105, 186, 255, 0.05), transparent 40%)",
  shellScene: `url("${islandDarkUrl}")`,
  /**
   * Hexagon tile on the photo. The veil darkens the whole plate, including the
   * center, so the moon does not wash the cards. The island still reads in the gaps.
   */
  shellSceneGrid: `url("${hexagonUrl}")`,
  shellSceneVeil:
    "radial-gradient(ellipse at 50% 50%, rgba(1, 6, 14, 0.58) 0%, rgba(1, 6, 14, 0.66) 40%, rgba(1, 4, 10, 0.80) 72%, rgba(1, 4, 10, 0.92) 100%)",
  shellSceneFilter: "blur(4px) saturate(115%)",
  listVesselShadow: "inset 0 1px 0 rgba(218, 250, 255, 0.08)",
  sidebarFooterBorder: "1px solid color-mix(in srgb, var(--app-color-border) 18%, transparent)",
  sidebarFooterMargin: "var(--app-space-xxs)",
  sidebarFooterPadding: "var(--app-space-sm)",
  serverRailBg: "rgba(18,56,74,0.42)",
  mastBg: "transparent",
  overviewStageBg: "transparent",
  overviewStagePad: "0px",
  overviewStageBorder: "none",
  overviewAsideBg: "var(--app-float-panel-bg)",
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
  menuBg: "rgba(16, 42, 56, 0.46)",
  /** Ring plus a drop. The translucent menu otherwise disappears into the night plate. */
  menuShadow: "0 0 0 1px rgba(95, 197, 220, 0.40), 0 12px 32px rgba(0, 0, 0, 0.50)",
  notificationBg: "rgba(32,72,90,0.56)",
  notificationShadow: "0 0 0 1px rgba(95, 197, 220, 0.40), 0 12px 32px rgba(0, 0, 0, 0.50)",
  downloadsConsoleInset: "var(--app-space-md)",
  /** A light gold veil. The cyan glass shows through; a black mix painted a brown slab. */
  attentionLight: "color-mix(in srgb, var(--app-color-attention) 12%, transparent)",
  attentionLightHover: "color-mix(in srgb, var(--app-color-attention) 20%, transparent)",
  /** A notch under the raised frost. The darker navy inset read as a heavy step. */
  listVesselBg: "rgba(42, 84, 102, 0.86)",
  tableHeadBg: "color-mix(in srgb, var(--app-color-panel-raised) 72%, transparent)",
  iconButtonShadow: "inset 0 1px 0 rgba(230, 252, 255, 0.36), inset 0 -1px 0 rgba(0, 12, 20, 0.16)",
  /** Thin glass. The raised card is denser; these idle plates should show the scene. */
  iconButtonBg: "rgba(46,88,108,0.28)",
  iconButtonDefaultBg: "rgba(46,88,108,0.28)",
  /**
   * Deeper teal than the night cyan, with a white label and a short veil.
   * `#28d4ec` stays the accent for links, loose icons, and the hex. Hover
   * lifts one ramp step so it reads, without sinking toward disabled.
   */
  primaryButtonBg: "color-mix(in srgb, var(--ark-blue-5) 92%, transparent)",
  primaryButtonHover: "var(--ark-blue-6)",
  primaryButtonColor: "var(--mantine-color-white)",
  /** Quieter than the idle button and the hover slab. No border. */
  tabInactiveBg: "rgba(46, 88, 108, 0.18)",
  /** One step lighter than the inactive plate. The accent line still marks it. */
  tabActiveBg: "rgba(96, 176, 196, 0.34)",
  tabActiveHoverBg: "rgba(96, 176, 196, 0.46)",
});

export const glassyLightMaterials: AppThemeMaterials = glassyMaterials({
  /**
   * Same neutral milk on the sidebar, the server column, and the title band.
   * Open white let the jungle dye the chrome green. Still a step under the card.
   */
  chromeBg: "rgba(248,250,252,0.64)",
  panelBg: "rgba(248,250,252,0.68)",
  raisedBg: "rgba(248,250,252,0.82)",
  floatPanelBg: "rgba(248,250,252,0.82)",
  contentPaneBg: "rgba(248,250,252,0.28)",
  nestedRowBg: "rgba(248,250,252,0.82)",
  chipBg: "rgba(220, 230, 236, 0.55)",
  glassSheen: "linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.12) 16%, transparent 38%)",
  glassRim: "inset 0 1px 0 rgba(255, 255, 255, 0.75)",
  borderSubtle: "rgba(22, 32, 40, 0.08)",
  border: "rgba(22, 32, 40, 0.14)",
  borderControl: "rgba(12, 116, 144, 0.55)",
  listSelectedBg: "rgba(12, 116, 144, 0.14)",
  listSelectedInset:
    "inset 3px 0 0 var(--app-color-accent), 0 0 0 1px rgba(12, 116, 144, 0.16), 0 0 14px rgba(12, 116, 144, 0.10)",
  shellAtmosphere:
    "radial-gradient(circle at 14% 10%, rgba(12, 116, 144, 0.10), transparent 28%), radial-gradient(circle at 86% 18%, rgba(40, 160, 190, 0.08), transparent 24%)",
  /**
   * Day plate. A light blur softens the jungle without melting it. Brightness
   * and a cool veil pull it down a step so the scene is not a light box.
   */
  shellScene: `url("${islandUrl}")`,
  shellSceneGrid: `url("${hexagonUrl}")`,
  shellSceneVeil:
    "radial-gradient(ellipse at 50% 50%, rgba(196, 208, 214, 0.42) 0%, rgba(176, 190, 198, 0.50) 52%, rgba(158, 174, 184, 0.58) 100%)",
  shellSceneFilter: "blur(8px) saturate(140%) brightness(0.78)",
  listVesselShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.55)",
  sidebarFooterBorder: "none",
  sidebarFooterMargin: "var(--app-space-xs)",
  sidebarFooterPadding: "var(--app-space-xs)",
  serverRailBg: "rgba(248,250,252,0.64)",
  mastBg: "rgba(248,250,252,0.64)",
  /** Holds the server rows so the day photo does not take the empty list. */
  overviewStageBg: "rgba(248,250,252,0.64)",
  overviewStagePad: "var(--app-space-sm)",
  overviewStageBorder: "1px solid var(--app-color-border-subtle)",
  overviewAsideBg: "rgba(248,250,252,0.64)",
  /**
   * No plate behind the version and Quit. A second milk card made those two
   * read as one control on the day scene. Quit keeps its own button.
   */
  sidebarFooterRadius: "0px",
  sidebarFooterBg: "transparent",
  sidebarFooterFilter: "none",
  versionChipPaddingTop: "var(--app-space-xxs)",
  brandLightPadding: "var(--app-space-xxs)",
  brandLightRadius: "var(--app-radius-md)",
  brandLightFlex: "0 1 auto",
  inputWellBg: "color-mix(in srgb, var(--app-color-text) 5%, white)",
  menuBg: "rgba(255,255,255,0.78)",
  /** Ring plus a drop. The milk list otherwise sits flush with the day plate. */
  menuShadow: "0 0 0 1px rgba(22, 32, 40, 0.22), 0 10px 28px rgba(16, 28, 36, 0.22)",
  notificationBg: "rgba(248,250,252,0.82)",
  notificationShadow: "0 0 0 1px rgba(22, 32, 40, 0.22), 0 10px 28px rgba(16, 28, 36, 0.22)",
  downloadsConsoleInset: "var(--app-space-md)",
  attentionLight:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 14%, transparent), color-mix(in srgb, var(--app-color-attention) 22%, transparent))",
  attentionLightHover:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 22%, transparent), color-mix(in srgb, var(--app-color-attention) 32%, transparent))",
  /** Denser than the glass panels so rows stay readable over the photo. */
  listVesselBg: "rgba(255,255,255,0.88)",
  tableHeadBg: "color-mix(in srgb, var(--app-color-panel-raised) 72%, transparent)",
  iconButtonShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(20, 32, 40, 0.16)",
  /**
   * Cool neutral plate for idle and default buttons, so they stay visible on
   * the white glass without borrowing the jungle green.
   */
  iconButtonBg: "rgba(226, 234, 238, 0.70)",
  iconButtonDefaultBg: "rgba(226, 234, 238, 0.70)",
  /** Short veil on the accent. Hover lifts one ramp step; the label stays white. */
  primaryButtonBg: "color-mix(in srgb, var(--app-color-accent) 92%, transparent)",
  primaryButtonHover: "var(--ark-blue-8)",
  primaryButtonColor: "var(--mantine-color-white)",
  /** Quieter than the idle button. No border. */
  tabInactiveBg: "rgba(226, 234, 238, 0.42)",
  /** A whiter plate than the inactive tab. The accent line still marks it. */
  tabActiveBg: "rgba(255, 255, 255, 0.66)",
  tabActiveHoverBg: "rgba(255, 255, 255, 0.80)",
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
