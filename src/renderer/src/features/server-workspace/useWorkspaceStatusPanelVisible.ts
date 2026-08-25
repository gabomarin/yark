import { useLayoutEffect } from "react";

/**
 * Wide layout: Status is always on screen. Compact: only when the drawer is open.
 * Reports visibility so process metrics sampling can stay gated (#302).
 * Layout effect so Overview → workspace does not briefly disable sampling.
 */
export function useWorkspaceStatusPanelVisible(
  compactWorkspace: boolean,
  serverActionsOpen: boolean,
  onVisibleChange?: (visible: boolean) => void,
): void {
  useLayoutEffect(() => {
    onVisibleChange?.(!compactWorkspace || serverActionsOpen);
    return () => {
      onVisibleChange?.(false);
    };
  }, [compactWorkspace, serverActionsOpen, onVisibleChange]);
}
