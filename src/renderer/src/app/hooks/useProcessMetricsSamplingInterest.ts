import { useEffect, useState } from "react";
import type { Overlay } from "@app/model/appOverlay";
import type { Route } from "@layout/Sidebar/Sidebar";

/**
 * Tell main when Overview or workspace Status is showing so process metrics
 * only run PowerShell samples while those surfaces need them (#302).
 *
 * Workspace Status visibility defaults to true so Overview → workspace does
 * not briefly disable sampling (wide layouts keep Status on screen; compact
 * drawer-closed corrects to false on the first layout report).
 */
export function useProcessMetricsSamplingInterest(input: {
  route: Route;
  overlay: Overlay;
}): {
  onWorkspaceStatusPanelVisibleChange: (visible: boolean) => void;
} {
  const [workspaceStatusVisible, setWorkspaceStatusVisible] = useState(true);
  const onOverview =
    input.overlay == null && input.route === "overview";
  const onWorkspace = input.overlay?.kind === "workspace";
  const samplingNeeded =
    onOverview || (onWorkspace && workspaceStatusVisible);

  useEffect(() => {
    if (!onWorkspace) {
      // Reset optimistic default for the next workspace open.
      setWorkspaceStatusVisible(true);
    }
  }, [onWorkspace]);

  useEffect(() => {
    if (typeof window.api.setProcessMetricsSampling !== "function") {
      return;
    }
    void window.api.setProcessMetricsSampling(samplingNeeded);
  }, [samplingNeeded]);

  useEffect(() => {
    return () => {
      if (typeof window.api.setProcessMetricsSampling === "function") {
        void window.api.setProcessMetricsSampling(false);
      }
    };
  }, []);

  return {
    onWorkspaceStatusPanelVisibleChange: setWorkspaceStatusVisible,
  };
}
