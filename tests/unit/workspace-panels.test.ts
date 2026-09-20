import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PANELS_OPTION,
  WORKSPACE_PANELS_OPTION_LIST,
  WORKSPACE_PANELS_OPTIONS,
  drawersMediaQuery,
  resolveWorkspacePanelsOption,
  workspacePanelsModeFor,
} from "@shared/workspace/workspacePanels";

describe("server-workspace panels (#PUX-004 Track B)", () => {
  it("names Auto as the default and Drawers as the opt-out", () => {
    expect(DEFAULT_WORKSPACE_PANELS_OPTION.id).toBe("auto");
    expect(WORKSPACE_PANELS_OPTION_LIST.map((option) => option.id)).toEqual(["auto", "drawers"]);
    expect(WORKSPACE_PANELS_OPTIONS.auto.columnsMinPx).toBe(1600);
    expect(WORKSPACE_PANELS_OPTIONS.drawers.columnsMinPx).toBeNull();
  });

  it("falls back to the default option for an unknown id", () => {
    expect(resolveWorkspacePanelsOption("mosaic").id).toBe("auto");
    expect(resolveWorkspacePanelsOption(null).id).toBe("auto");
    expect(resolveWorkspacePanelsOption(undefined).id).toBe("auto");
  });

  it("switches the workspace at the option breakpoint", () => {
    const auto = WORKSPACE_PANELS_OPTIONS.auto;
    expect(workspacePanelsModeFor(auto, 1599)).toBe("drawers");
    expect(workspacePanelsModeFor(auto, 1600)).toBe("columns");
    expect(workspacePanelsModeFor(auto, 2560)).toBe("columns");

    // Drawers never uses columns, however wide the window is.
    expect(workspacePanelsModeFor(WORKSPACE_PANELS_OPTIONS.drawers, 1599)).toBe("drawers");
    expect(workspacePanelsModeFor(WORKSPACE_PANELS_OPTIONS.drawers, 2560)).toBe("drawers");
  });

  it("keeps the media query and the pure decision in step", () => {
    for (const option of WORKSPACE_PANELS_OPTION_LIST) {
      const query = drawersMediaQuery(option);
      const min = option.columnsMinPx;
      if (min === null) {
        expect(query, option.id).toBeNull();
        continue;
      }
      expect(query, option.id).toBe(`(max-width: ${min - 1}px)`);
      expect(workspacePanelsModeFor(option, min - 1)).toBe("drawers");
      expect(workspacePanelsModeFor(option, min)).toBe("columns");
    }
  });

  it("matches the one hand-written mirror: the Overview side-by-side breakpoint", () => {
    // CSS cannot read the option, so the media query that mirrors Auto is pinned
    // here instead of drifting away from the registry.
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/src/features/overview/OverviewPage.module.css"),
      "utf8",
    );
    expect(css).toContain(`@media (min-width: ${WORKSPACE_PANELS_OPTIONS.auto.columnsMinPx}px)`);
  });
});
