import type { ReactElement, ReactNode } from "react";
import { useWorkspaceListRail } from "../../useWorkspaceListRail";
import { SIDE_PANEL_PX } from "../../workspaceLayoutModel";
import classes from "./WorkspaceSplitBody.module.css";

export interface WorkspaceListRenderOptions {
  iconMode: boolean;
  onToggleRail: () => void;
}

interface Props {
  /** When true, hide list/side columns (drawers own them) but keep main mounted. */
  compact?: boolean;
  renderList: (options: WorkspaceListRenderOptions) => ReactNode;
  main: ReactNode;
  side: ReactNode;
}

/**
 * Workspace body: fixed Full/Rail list column + main + fixed side (#107).
 * List/side stay in the tree when `compact` so main does not remount on resize (#271).
 * List rail toggle lives in ServerListPanel chrome (not a seam control — avoids clashing with Sidebar).
 */
export function WorkspaceSplitBody(props: Props): ReactElement {
  const listRail = useWorkspaceListRail();
  const compact = props.compact === true;

  return (
    <div className={classes.root} data-compact={compact || undefined}>
      <div
        className={classes.listPane}
        data-rail={listRail.iconMode || undefined}
        data-hidden={compact || undefined}
        aria-hidden={compact || undefined}
        style={
          compact
            ? undefined
            : {
                width: listRail.listWidthPx,
                flex: `0 0 ${listRail.listWidthPx}px`,
              }
        }
      >
        {!compact &&
          props.renderList({
            iconMode: listRail.iconMode,
            onToggleRail: listRail.toggleRail,
          })}
      </div>
      <div className={classes.mainPane}>{props.main}</div>
      <div
        className={classes.side}
        data-hidden={compact || undefined}
        aria-hidden={compact || undefined}
        style={
          compact
            ? undefined
            : { width: SIDE_PANEL_PX, flex: `0 0 ${SIDE_PANEL_PX}px` }
        }
      >
        {!compact && props.side}
      </div>
    </div>
  );
}
