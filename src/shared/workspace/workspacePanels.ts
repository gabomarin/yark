import {
  DEFAULT_WORKSPACE_PANELS_ID,
  WORKSPACE_PANELS_IDS,
  isWorkspacePanelsId,
  type WorkspacePanelsId,
} from "../settings/appearance";

/**
 * Where the server workspace puts its server list and status panel.
 *
 * This used to be a hardcoded `matchMedia` in the workspace plus a
 * `@media (min-width: 1600px)` in Overview. It is one named contract now: the
 * options are data, `workspacePanelsModeFor` is the pure decision the tests pin,
 * and the one hand-written CSS mirror is guarded by a test.
 *
 * Not to be confused with an app-level *layout* (how the whole app is
 * structured), which is a separate ticket.
 */
export type WorkspacePanelsMode = "columns" | "drawers";

export interface WorkspacePanelsOption {
  id: WorkspacePanelsId;
  label: string;
  /** Shown as the row's helper line for the selected option. */
  description: string;
  /**
   * Window width (px) from which the panels take their own columns.
   * `null` = never; they stay in drawers at any width.
   */
  columnsMinPx: number | null;
}

export const WORKSPACE_PANELS_OPTIONS: Readonly<Record<WorkspacePanelsId, WorkspacePanelsOption>> = {
  auto: {
    id: "auto",
    label: "Auto",
    description: "Columns when the window is wide enough.",
    columnsMinPx: 1600,
  },
  drawers: {
    id: "drawers",
    label: "Drawers",
    description: "Always in drawers, never columns.",
    columnsMinPx: null,
  },
};

/** Registry order = the order the Appearance control lists them in. */
export const WORKSPACE_PANELS_OPTION_LIST: readonly WorkspacePanelsOption[] = WORKSPACE_PANELS_IDS.map(
  (id) => WORKSPACE_PANELS_OPTIONS[id],
);

export const DEFAULT_WORKSPACE_PANELS_OPTION: WorkspacePanelsOption =
  WORKSPACE_PANELS_OPTIONS[DEFAULT_WORKSPACE_PANELS_ID];

export function resolveWorkspacePanelsOption(id: string | null | undefined): WorkspacePanelsOption {
  return isWorkspacePanelsId(id) ? WORKSPACE_PANELS_OPTIONS[id] : DEFAULT_WORKSPACE_PANELS_OPTION;
}

/** Pure decision: the contract the workspace and its tests share. */
export function workspacePanelsModeFor(option: WorkspacePanelsOption, viewportWidthPx: number): WorkspacePanelsMode {
  const min = option.columnsMinPx;
  if (min === null || !Number.isFinite(viewportWidthPx)) {
    return "drawers";
  }
  return viewportWidthPx >= min ? "columns" : "drawers";
}

/**
 * Media query that matches when this option falls back to drawers.
 * `null` when the option never uses columns.
 */
export function drawersMediaQuery(option: WorkspacePanelsOption): string | null {
  const min = option.columnsMinPx;
  return min === null ? null : `(max-width: ${min - 1}px)`;
}
