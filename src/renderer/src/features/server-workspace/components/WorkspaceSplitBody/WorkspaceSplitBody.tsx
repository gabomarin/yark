import type { ReactElement, ReactNode } from "react";
import { useWorkspaceListRail } from "../../useWorkspaceListRail";
import { SIDE_PANEL_PX } from "../../workspaceLayoutModel";
import classes from "./WorkspaceSplitBody.module.css";

export interface WorkspaceListRenderOptions {
  iconMode: boolean;
  onToggleRail: () => void;
}

interface Props {
  renderList: (options: WorkspaceListRenderOptions) => ReactNode;
  main: ReactNode;
  side: ReactNode;
}

/**
 * Wide-layout body: fixed Full/Rail list column + main + fixed side (#107).
 * List rail toggle lives in ServerListPanel chrome (not a seam control — avoids clashing with Sidebar).
 */
export function WorkspaceSplitBody(props: Props): ReactElement {
  const listRail = useWorkspaceListRail();

  return (
    <div className={classes.root}>
      <div
        className={classes.listPane}
        data-rail={listRail.iconMode || undefined}
        style={{
          width: listRail.listWidthPx,
          flex: `0 0 ${listRail.listWidthPx}px`,
        }}
      >
        {props.renderList({
          iconMode: listRail.iconMode,
          onToggleRail: listRail.toggleRail,
        })}
      </div>
      <div className={classes.mainPane}>{props.main}</div>
      <div className={classes.side} style={{ width: SIDE_PANEL_PX, flex: `0 0 ${SIDE_PANEL_PX}px` }}>
        {props.side}
      </div>
    </div>
  );
}
