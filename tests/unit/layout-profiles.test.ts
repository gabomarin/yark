import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PROFILE,
  LAYOUT_PROFILE_LIST,
  LAYOUT_PROFILES,
  drawersMediaQuery,
  resolveLayoutProfile,
  workspaceModeFor,
} from "@shared/layout/layoutProfiles";

describe("layout profiles (#PUX-004 Track B)", () => {
  it("names Adaptive as the default and Drawers as the opt-out", () => {
    expect(DEFAULT_LAYOUT_PROFILE.id).toBe("adaptive");
    expect(LAYOUT_PROFILE_LIST.map((profile) => profile.id)).toEqual(["adaptive", "drawers"]);
    expect(LAYOUT_PROFILES.adaptive.workspaceThreeColumnMinPx).toBe(1600);
    expect(LAYOUT_PROFILES.drawers.workspaceThreeColumnMinPx).toBeNull();
  });

  it("falls back to the default profile for an unknown id", () => {
    expect(resolveLayoutProfile("mosaic").id).toBe("adaptive");
    expect(resolveLayoutProfile(null).id).toBe("adaptive");
    expect(resolveLayoutProfile(undefined).id).toBe("adaptive");
  });

  it("switches the workspace at the profile breakpoint", () => {
    const adaptive = LAYOUT_PROFILES.adaptive;
    expect(workspaceModeFor(adaptive, 1599)).toBe("drawers");
    expect(workspaceModeFor(adaptive, 1600)).toBe("three-column");
    expect(workspaceModeFor(adaptive, 2560)).toBe("three-column");

    // Drawers never goes three-column, however wide the window is.
    expect(workspaceModeFor(LAYOUT_PROFILES.drawers, 1599)).toBe("drawers");
    expect(workspaceModeFor(LAYOUT_PROFILES.drawers, 2560)).toBe("drawers");
  });

  it("keeps the media query and the pure decision in step", () => {
    for (const profile of LAYOUT_PROFILE_LIST) {
      const query = drawersMediaQuery(profile);
      const min = profile.workspaceThreeColumnMinPx;
      if (min === null) {
        expect(query, profile.id).toBeNull();
        continue;
      }
      expect(query, profile.id).toBe(`(max-width: ${min - 1}px)`);
      expect(workspaceModeFor(profile, min - 1)).toBe("drawers");
      expect(workspaceModeFor(profile, min)).toBe("three-column");
    }
  });

  it("matches the one hand-written mirror: the Overview side-by-side breakpoint", () => {
    // CSS cannot read the profile, so the media query that mirrors Adaptive is
    // pinned here instead of drifting away from the registry.
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/renderer/src/features/overview/OverviewPage.module.css"),
      "utf8",
    );
    expect(css).toContain(`@media (min-width: ${LAYOUT_PROFILES.adaptive.workspaceThreeColumnMinPx}px)`);
  });
});
