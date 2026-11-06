import { describe, expect, it } from "vitest";
import {
  addableIniSettingsForSection,
  canonicalIniSection,
  canonicalIniSettingKey,
  defaultIniSection,
  iniSectionError,
  iniSectionsForNewSetting,
  iniSettingKeyError,
} from "./iniAddSettingModel";

describe("addableIniSettingsForSection", () => {
  it("lists documented settings that are missing from the section", () => {
    const open = addableIniSettingsForSection("gameUserSettings", "ServerSettings", new Set());
    expect(open.length).toBeGreaterThan(1);
    const sample = open[0];
    if (sample === undefined) throw new Error("expected a documented ServerSettings key");
    expect(["boolean", "text", "number", "range"]).toContain(sample.input.type);

    const present = new Set([sample.key.toLowerCase()]);
    const remaining = addableIniSettingsForSection("gameUserSettings", "ServerSettings", present);
    expect(remaining.some((choice) => choice.key === sample.key)).toBe(false);
    expect(remaining.length).toBe(open.length - 1);
    expect(remaining.map((choice) => choice.key)).toEqual(
      [...remaining.map((choice) => choice.key)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("returns nothing for a section with no documented settings", () => {
    expect(addableIniSettingsForSection("gameUserSettings", "NotARealSection", new Set())).toEqual([]);
  });
});

describe("iniSettingKeyError", () => {
  const present = new Set(["sessionname"]);

  it("rejects an empty name, a separator, and a name the section already has", () => {
    expect(iniSettingKeyError("  ", present)).toBe("Enter a setting name.");
    expect(iniSettingKeyError("Foo=Bar", present)).toBe("Setting names cannot include = or brackets.");
    expect(iniSettingKeyError("SessionName", present)).toBe("This section already has that setting.");
    expect(iniSettingKeyError("NewSetting", present)).toBeNull();
  });
});

describe("iniSectionsForNewSetting", () => {
  it("offers stock sections and a section already in the file", () => {
    const sections = iniSectionsForNewSetting("gameUserSettings", ["AwesomeMod"]);
    expect(sections[0]).toBe("ServerSettings");
    expect(sections).toContain("SessionSettings");
    expect(sections).toContain("MessageOfTheDay");
    expect(sections).toContain("AwesomeMod");
    expect(defaultIniSection("gameUserSettings", sections)).toBe("ServerSettings");
  });

  it("keeps a typed mod section and drops surrounding brackets", () => {
    const known = ["ServerSettings"];
    expect(canonicalIniSection(" [CoolMod] ", known)).toBe("CoolMod");
    expect(canonicalIniSection("serversettings", known)).toBe("ServerSettings");
    expect(iniSectionError("")).toBe("Enter a section name.");
    expect(iniSectionError("Cool]Mod")).toBe("Section names cannot include brackets.");
    expect(iniSectionError("CoolMod")).toBeNull();
  });
});

describe("canonicalIniSettingKey", () => {
  it("uses the documented spelling when the typed name matches", () => {
    const choices = [{ key: "XPMultiplier", description: "XP", defaultValue: "1", input: { type: "number" as const } }];
    expect(canonicalIniSettingKey(" xpmultiplier ", choices)).toBe("XPMultiplier");
    expect(canonicalIniSettingKey("CustomKey", choices)).toBe("CustomKey");
  });
});
