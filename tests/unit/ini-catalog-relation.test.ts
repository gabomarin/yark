import { describe, expect, it } from "vitest";
import {
  canUnsetIniSetting,
  catalogRelationLabel,
  lookupVerifiedIniDefault,
  resolveIniCatalogRelation,
} from "@shared/ini/ini-catalog-relation";

describe("ini catalog relation (PINI-002 / #663)", () => {
  it("maps saved values to Custom, Default, Unset, and Unknown", () => {
    expect(resolveIniCatalogRelation(null, "1.0")).toBe("unset");
    expect(resolveIniCatalogRelation("1.0", null)).toBe("unknown");
    expect(resolveIniCatalogRelation("1.0", "1.0")).toBe("default");
    expect(resolveIniCatalogRelation("0.9", "1.0")).toBe("custom");
  });

  it("never treats an inferred catalog default as verified", () => {
    // Most rows remain inferred; a random visual key should not become verified.
    expect(lookupVerifiedIniDefault("gameUserSettings", "ServerSettings", "AllowFlyerCarryPvE")).toBeNull();
  });

  it("exposes a small verified default seed for demo keys", () => {
    const difficulty = lookupVerifiedIniDefault("gameUserSettings", "ServerSettings", "DifficultyOffset");
    expect(difficulty).not.toBeNull();
    expect(difficulty?.value).toBe("1.0");
    expect(difficulty?.source).toBe("community-defaults-review");
    expect(difficulty?.reviewedAt).toBe("2026-10-17");
  });

  it("allows Unset only when absencePolicy is allowed", () => {
    expect(canUnsetIniSetting("gameUserSettings", "ServerSettings", "DifficultyOffset")).toBe(true);
    // Profile-owned keys are not absence-allowed for visual Unset.
    expect(canUnsetIniSetting("gameUserSettings", "ServerSettings", "RCONPort")).toBe(false);
  });

  it("keeps Unset independent of a wrong verified default argument", () => {
    // Even if a caller passes a bogus verified default, absence stays Unset.
    expect(resolveIniCatalogRelation(null, "totally-wrong")).toBe("unset");
    expect(catalogRelationLabel("unset")).toBe("Unset");
  });
});
