import { describe, expect, it } from "vitest";
import {
  classifyIniSettingPresence,
  diagnoseIniSettingMetaCatalog,
  INI_IMPORT_PRECEDENCE,
  isAsaIgnoredIniMaxPlayers,
  isCatalogOwnedIniKey,
  isVisuallyEditableIniSetting,
  lookupAbsencePolicy,
  lookupEnforcement,
  lookupProvenance,
  lookupSettingOwner,
} from "@shared/ini/ini-setting-decisions";
import { lookupIniSettingMeta } from "@shared/ini/ini-setting-meta";
import metaEnums from "@shared/ini/ini-setting-meta-enums.json";
import { sanitizeServerIniPayload } from "@shared/ini/ini-text";

describe("ini-setting-decisions", () => {
  it("assigns verified ownership metadata to profile and ASE-legacy keys", () => {
    expect(lookupSettingOwner("gameUserSettings", "SessionSettings", "SessionName")).toBe("serverProfile");
    expect(lookupAbsencePolicy("gameUserSettings", "SessionSettings", "Port")).toBe("forbidden");
    expect(lookupAbsencePolicy("gameUserSettings", "ServerSettings", "ServerPassword")).toBe("mapsToProfileNull");
    expect(lookupEnforcement("gameUserSettings", "ServerSettings", "RCONPort")).toBe("blocking");
    expect(lookupSettingOwner("gameUserSettings", "ServerSettings", "ActiveMods")).toBe("system");
    expect(lookupEnforcement("gameUserSettings", "ServerSettings", "ActiveMods")).toBe("warning");

    const session = lookupProvenance("gameUserSettings", "SessionSettings", "SessionName");
    expect(session?.confidence).toBe("verified");
    expect(session?.reviewedAt).toBe("2026-08-13");
  });

  it("defaults ordinary catalog settings to iniVisual with allowed absence", () => {
    expect(lookupSettingOwner("gameUserSettings", "ServerSettings", "AllowFlyerCarryPvE")).toBe("iniVisual");
    expect(lookupAbsencePolicy("gameUserSettings", "ServerSettings", "AllowFlyerCarryPvE")).toBe("allowed");
    expect(lookupEnforcement("gameUserSettings", "ServerSettings", "AllowFlyerCarryPvE")).toBe("advisory");
    expect(lookupProvenance("gameUserSettings", "ServerSettings", "AllowFlyerCarryPvE")?.confidence).toBe("inferred");
  });

  it("keeps a small verified default seed for PINI-002 demo keys", () => {
    const admin = lookupProvenance("gameUserSettings", "ServerSettings", "AdminLogging");
    expect(admin?.confidence).toBe("verified");
    expect(admin?.source).toBe("community-defaults-review");
    expect(admin?.reviewedAt).toBe("2026-10-17");
  });

  it("keeps unknown keys unknown (no invented catalog owner)", () => {
    expect(lookupSettingOwner("gameUserSettings", "SuperStructures", "EnableSomething")).toBe("unknown");
    expect(lookupAbsencePolicy("gameUserSettings", "SuperStructures", "EnableSomething")).toBe("unknown");
    expect(classifyIniSettingPresence("gameUserSettings", "SuperStructures", "EnableSomething", true)).toBe("unknown");
    expect(classifyIniSettingPresence("gameUserSettings", "ServerSettings", "AdminLogging", false)).toBe("absent");
    expect(classifyIniSettingPresence("gameUserSettings", "SessionSettings", "SessionName", true)).toBe("profileOwned");
    expect(classifyIniSettingPresence("gameUserSettings", "ServerSettings", "ActiveMods", true)).toBe("systemOwned");
    expect(classifyIniSettingPresence("gameUserSettings", "ServerSettings", "AdminLogging", true)).toBe(
      "knownSupported",
    );
  });

  it("excludes profile/system-owned keys and MaxPlayers from visual editing", () => {
    expect(isVisuallyEditableIniSetting("gameUserSettings", "SessionSettings", "SessionName")).toBe(false);
    expect(isVisuallyEditableIniSetting("gameUserSettings", "ServerSettings", "ActiveMods")).toBe(false);
    expect(isVisuallyEditableIniSetting("gameUserSettings", "SessionSettings", "MaxPlayers")).toBe(false);
    expect(isAsaIgnoredIniMaxPlayers("MaxPlayers")).toBe(true);
    expect(isCatalogOwnedIniKey("SessionSettings", "MaxPlayers")).toBe(false);
    expect(isVisuallyEditableIniSetting("gameUserSettings", "ServerSettings", "AdminLogging")).toBe(true);
    expect(isVisuallyEditableIniSetting("gameUserSettings", "ModSection", "CustomFlag")).toBe(true);
  });

  it("exposes import precedence constants for later sync work", () => {
    expect(INI_IMPORT_PRECEDENCE.profileAuthoritativeAfterSync).toBe(true);
    expect(INI_IMPORT_PRECEDENCE.preserveRawUntilIntentionalSync).toBe(true);
    expect(INI_IMPORT_PRECEDENCE.reportConflicts).toBe(true);
    expect(INI_IMPORT_PRECEDENCE.absenceIsNotCatalogDefault).toBe(true);
  });

  it("reports a clean catalog diagnostic pass", () => {
    expect(diagnoseIniSettingMetaCatalog()).toEqual([]);
  });

  it("shares enum vocabulary with the catalog builder", () => {
    expect(metaEnums.owners).toEqual(["serverProfile", "iniVisual", "externalManual", "system"]);
    expect(metaEnums.absencePolicies).toEqual(["allowed", "forbidden", "mapsToProfileNull"]);
    expect(metaEnums.enforcements).toEqual(["blocking", "warning", "advisory"]);
    expect(metaEnums.provenanceConfidences).toEqual(["verified", "inferred", "unknown"]);
    expect(metaEnums.applicabilityGames).toEqual(["asa"]);
  });

  it("does not materialize catalog defaults for absent keys during sanitize round-trip", () => {
    const input = {
      gameUserSettings: "[ServerSettings]\nDifficultyOffset=0.5\nCustomModKey=1\n",
      game: "[/script/shootergame.shootergamemode]\nHarvestAmountMultiplier=2\n",
    };
    const roundTrip = sanitizeServerIniPayload(input);
    expect(roundTrip.gameUserSettings).toContain("DifficultyOffset=0.5");
    expect(roundTrip.gameUserSettings).toContain("CustomModKey=1");
    expect(roundTrip.gameUserSettings).not.toMatch(/AdminLogging=/i);
    expect(lookupIniSettingMeta("gameUserSettings", "ServerSettings", "AdminLogging")).toBeDefined();
    expect(roundTrip.game).toContain("HarvestAmountMultiplier=2");
  });
});
