import {
  DEFAULT_LAYOUT_PROFILE_ID,
  LAYOUT_PROFILE_IDS,
  isLayoutProfileId,
  type LayoutProfileId,
} from "../settings/appearance";

/**
 * Layout profiles (#PUX-004 Track B).
 *
 * The Adaptive-workspace rules used to live as a hardcoded `matchMedia` in the
 * workspace plus a `@media (min-width: 1600px)` in Overview. They are one named
 * contract now: the profile is data, `workspaceModeFor` is the pure decision the
 * tests pin, and the one hand-written CSS mirror is guarded by a test.
 */
export type WorkspaceLayoutMode = "three-column" | "drawers";

export interface LayoutProfile {
  id: LayoutProfileId;
  label: string;
  /** One line the Appearance control shows. */
  description: string;
  /**
   * Viewport width (px) at which the server workspace shows three columns.
   * `null` = never; the panes stay in drawers at any width.
   */
  workspaceThreeColumnMinPx: number | null;
}

export const LAYOUT_PROFILES: Readonly<Record<LayoutProfileId, LayoutProfile>> = {
  adaptive: {
    id: "adaptive",
    label: "Adaptive",
    description: "Three columns when the window is wide enough, drawers when it is not.",
    workspaceThreeColumnMinPx: 1600,
  },
  drawers: {
    id: "drawers",
    label: "Drawers",
    description: "Keep the server list and the status panel in drawers, even on a wide window.",
    workspaceThreeColumnMinPx: null,
  },
};

/** Registry order = the order the Appearance control lists them in. */
export const LAYOUT_PROFILE_LIST: readonly LayoutProfile[] = LAYOUT_PROFILE_IDS.map((id) => LAYOUT_PROFILES[id]);

export const DEFAULT_LAYOUT_PROFILE: LayoutProfile = LAYOUT_PROFILES[DEFAULT_LAYOUT_PROFILE_ID];

export function resolveLayoutProfile(id: string | null | undefined): LayoutProfile {
  return isLayoutProfileId(id) ? LAYOUT_PROFILES[id] : DEFAULT_LAYOUT_PROFILE;
}

/** Pure decision: the contract the workspace and its tests share. */
export function workspaceModeFor(profile: LayoutProfile, viewportWidthPx: number): WorkspaceLayoutMode {
  const min = profile.workspaceThreeColumnMinPx;
  if (min === null || !Number.isFinite(viewportWidthPx)) {
    return "drawers";
  }
  return viewportWidthPx >= min ? "three-column" : "drawers";
}

/**
 * Media query that matches when this profile falls back to drawers.
 * `null` when the profile never uses three columns.
 */
export function drawersMediaQuery(profile: LayoutProfile): string | null {
  const min = profile.workspaceThreeColumnMinPx;
  return min === null ? null : `(max-width: ${min - 1}px)`;
}
