import { describe, expect, it } from "vitest";
import {
  ASA_DEDICATED_GUS_SKELETON_SECTIONS,
  ASA_DEDICATED_GUS_SHELL_DEFAULTS,
  ASA_SHOOTER_GUS_SECTION,
  ASA_SHOOTER_GUS_VERSION,
  ensureAsaGameUserSettingsSkeleton,
  ensureAsaShooterGameUserSettingsVersion,
  hasIniSectionHeader,
} from "@shared/ini/asa-gus-skeleton";
import { applyProfileOwnedKeysToGameUserSettings } from "@backend/domains/config/ini-compose";
import { stripClientIniKeys } from "@shared/ini/ini-text";

const profile = {
  rconPort: 27020,
  adminPassword: "admin-a",
  serverPassword: "join-a",
  sessionName: "The Island",
  maxPlayers: 70,
  gamePort: 7777,
  queryPort: 27015,
};

describe("asa-gus-skeleton", () => {
  it("detects section headers case-insensitively", () => {
    expect(hasIniSectionHeader("[ScalabilityGroups]\n", "scalabilitygroups")).toBe(true);
    expect(hasIniSectionHeader("[ServerSettings]\n", "ScalabilityGroups")).toBe(false);
  });

  it("adds Version=5 when ShooterGameUserSettings lacks Version", () => {
    const input = `[${ASA_SHOOTER_GUS_SECTION}]\nbUseVSync=False\n`;
    const out = ensureAsaShooterGameUserSettingsVersion(input);
    expect(out).toContain(`Version=${ASA_SHOOTER_GUS_VERSION}`);
    expect(out).toContain("bUseVSync=False");
  });

  it("replaces blank or non-5 Version values with Version=5", () => {
    expect(ensureAsaShooterGameUserSettingsVersion(`[${ASA_SHOOTER_GUS_SECTION}]\nVersion=4\n`)).toContain(
      `Version=${ASA_SHOOTER_GUS_VERSION}`,
    );
    expect(ensureAsaShooterGameUserSettingsVersion(`[${ASA_SHOOTER_GUS_SECTION}]\nVersion=\n`)).toContain(
      `Version=${ASA_SHOOTER_GUS_VERSION}`,
    );
    const alreadyOk = `[${ASA_SHOOTER_GUS_SECTION}]\nVersion=5\n`;
    expect(ensureAsaShooterGameUserSettingsVersion(alreadyOk)).toBe(alreadyOk);
  });

  it("does not replace a populated shell when a later empty duplicate exists", () => {
    const input = [
      "[ScalabilityGroups]",
      "sg.ShadowQuality=3",
      "",
      "[ScalabilityGroups]",
      "",
      "[ServerSettings]",
      "XPMultiplier=2",
      "",
    ].join("\n");
    const out = ensureAsaGameUserSettingsSkeleton(input);
    expect(out).toContain("sg.ShadowQuality=3");
    expect(out.match(/\[ScalabilityGroups\]/g)?.length).toBe(1);
    expect(out).toContain("XPMultiplier=2");
  });

  it("drops an empty shell that appears before a populated duplicate", () => {
    const input = [
      "[ScalabilityGroups]",
      "",
      "[ScalabilityGroups]",
      "sg.ShadowQuality=3",
      "",
      "[ServerSettings]",
      "XPMultiplier=2",
      "",
    ].join("\n");
    const out = ensureAsaGameUserSettingsSkeleton(input);
    expect(out).toContain("sg.ShadowQuality=3");
    expect(out.match(/\[ScalabilityGroups\]/g)?.length).toBe(1);
    expect(out.indexOf("[ScalabilityGroups]")).toBeLessThan(out.indexOf("sg.ShadowQuality=3"));
  });

  it("seeds minimal shell defaults when sections are missing without touching rates", () => {
    const input = "[ServerSettings]\nXPMultiplier=2.5\nRCONPort=27020\n";
    const out = ensureAsaGameUserSettingsSkeleton(input);
    expect(out).toContain("XPMultiplier=2.5");
    expect(out).toContain("RCONPort=27020");
    expect(out).toContain("sg.ResolutionQuality=");
    expect(out).toContain("bUseDesiredScreenHeight=");
    expect(out).toContain("FrameGenerationMethod=");
    expect(out).toContain(`Version=${ASA_SHOOTER_GUS_VERSION}`);
    for (const section of ASA_DEDICATED_GUS_SKELETON_SECTIONS) {
      expect(hasIniSectionHeader(out, section)).toBe(true);
    }
  });

  it("fills empty shell stubs once and leaves populated shells alone", () => {
    const input = [
      "[ServerSettings]",
      "XPMultiplier=1",
      "",
      "[ScalabilityGroups]",
      "sg.ShadowQuality=3",
      "",
      `[${ASA_SHOOTER_GUS_SECTION}]`,
      "Version=5",
      "",
      "[/Script/Engine.GameUserSettings]",
      "",
      "[Startup]",
      "",
      "[/Script/Engine.GameSession]",
      "MaxPlayers=40",
      "",
    ].join("\n");
    const out = ensureAsaGameUserSettingsSkeleton(input);
    expect(out).toContain("sg.ShadowQuality=3");
    expect(out).toContain("bUseDesiredScreenHeight=");
    expect(out).toContain("FrameGenerationMethod=");
    expect(out).toMatch(/\[\/Script\/Engine\.GameSession\][\s\S]*MaxPlayers=40/i);
  });

  it("bundled shell defaults stay minimal and include Version=5", () => {
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).toContain("[ScalabilityGroups]");
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).toContain(`[${ASA_SHOOTER_GUS_SECTION}]`);
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).toContain(`Version=${ASA_SHOOTER_GUS_VERSION}`);
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).toContain("[/Script/Engine.GameUserSettings]");
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).toContain("[Startup]");
    expect(ASA_DEDICATED_GUS_SHELL_DEFAULTS).not.toContain("AdvancedGraphicsQuality");
  });

  it("keeps seeded shells through sanitize and profile sync", () => {
    const withRates = [
      "[ServerSettings]",
      "XPMultiplier=3",
      "RCONEnabled=True",
      "RCONPort=1",
      "ServerAdminPassword=old",
      "",
      "[SessionSettings]",
      "SessionName=Old",
      "Port=1",
      "QueryPort=1",
      "",
    ].join("\n");

    const sanitized = stripClientIniKeys(ensureAsaGameUserSettingsSkeleton(withRates));
    expect(sanitized).toContain("sg.ResolutionQuality=");
    expect(sanitized).toContain("FrameGenerationMethod=");
    expect(sanitized).toContain(`Version=${ASA_SHOOTER_GUS_VERSION}`);
    for (const section of ["ScalabilityGroups", ASA_SHOOTER_GUS_SECTION, "Startup"] as const) {
      expect(hasIniSectionHeader(sanitized, section)).toBe(true);
    }

    const synced = applyProfileOwnedKeysToGameUserSettings(sanitized, profile);
    expect(synced).toContain("XPMultiplier=3");
    expect(synced).toContain("RCONPort=27020");
    expect(synced).toContain("SessionName=The Island");
    expect(synced).toContain(`Version=${ASA_SHOOTER_GUS_VERSION}`);
  });
});
