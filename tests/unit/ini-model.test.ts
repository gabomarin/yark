import { describe, expect, it } from "vitest";
import { parseIniTextRows, sectionShortName, setIniTextValue, stripClientIniKeys } from "@shared/ini/ini-text";
import {
  filterIniRows,
  inferControlKind,
  isClientNoiseKey,
  parseIniRows,
  resolveControlKind,
  setIniValue,
} from "@features/server-workspace/iniModel";

describe("ini-text / iniModel section parsing", () => {
  const sample = `[/Script/Engine.GameSession]
MaxPlayers=70

[/Script/ShooterGame.ShooterGameUserSettings]
bUseVSync=False
ResolutionSizeX=1280
LastJoinedSessionPerCategory=One
LastJoinedSessionPerCategory=Two
LastJoinedSessionPerCategory=Three
`;

  it("treats dotted bracket headers as literal sections", () => {
    const rows = parseIniTextRows(sample);
    expect(rows.find((row) => row.key === "MaxPlayers")).toEqual({
      section: "/Script/Engine.GameSession",
      key: "MaxPlayers",
      value: "70",
    });
  });

  it("keeps duplicate unreal keys as separate occurrences", () => {
    const rows = parseIniRows(sample).filter((row) => row.key === "LastJoinedSessionPerCategory");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.value)).toEqual(["One", "Two", "Three"]);
    expect(rows.map((row) => row.occurrence)).toEqual([0, 1, 2]);
    expect(rows[0]?.duplicateCount).toBe(3);
  });

  it("strips client sections/keys so they are never persisted for dedicated servers", () => {
    const cleaned = stripClientIniKeys(sample);
    expect(cleaned).toContain("MaxPlayers=70");
    expect(cleaned).not.toContain("ShooterGameUserSettings");
    expect(cleaned).not.toContain("ResolutionSizeX");
    expect(cleaned).not.toContain("LastJoinedSessionPerCategory");
    expect(cleaned).not.toContain("bUseVSync");
  });

  it("hides client graphics sections from dedicated editor filters", () => {
    expect(isClientNoiseKey("LastJoinedSessionPerCategory")).toBe(true);
    expect(isClientNoiseKey("GraphicsQuality", "/Script/ShooterGame.ShooterGameUserSettings")).toBe(true);
    expect(isClientNoiseKey("sg.ShadowQuality", "ScalabilityGroups")).toBe(true);
    expect(isClientNoiseKey("MaxPlayers", "/Script/Engine.GameSession")).toBe(false);
    expect(inferControlKind("True")).toBe("boolean");
    const rows = parseIniRows(sample);
    const filtered = filterIniRows(rows, "", "all");
    expect(filtered.some((row) => row.key === "LastJoinedSessionPerCategory")).toBe(false);
    expect(filtered.some((row) => row.key === "ResolutionSizeX")).toBe(false);
    // ASA ignores INI MaxPlayers; the live cap is -WinLiveMaxPlayers on Server.
    expect(filtered.some((row) => row.key === "MaxPlayers")).toBe(false);
  });

  it("hides leftover MaxPlayers copies in the dedicated editor", () => {
    const rows = parseIniRows(
      [
        "[ServerSettings]",
        "MaxPlayers=9",
        "XPMultiplier=1.5",
        "",
        "[SessionSettings]",
        "MaxPlayers=6",
        "",
        "[/Script/Engine.GameSession]",
        "MaxPlayers=70",
        "",
      ].join("\n"),
    );
    const filtered = filterIniRows(rows, "", "all");
    expect(filtered.some((row) => row.key === "MaxPlayers")).toBe(false);
    expect(filtered.some((row) => row.key === "XPMultiplier")).toBe(true);
  });

  it("updates a specific duplicate occurrence", () => {
    const next = setIniTextValue(
      sample,
      "/Script/ShooterGame.ShooterGameUserSettings",
      "LastJoinedSessionPerCategory",
      "New",
      1,
    );
    const rows = parseIniRows(next).filter((row) => row.key === "LastJoinedSessionPerCategory");
    expect(rows.map((row) => row.value)).toEqual(["One", "New", "Three"]);
  });

  it("exposes a short category name from the last segment", () => {
    expect(sectionShortName("/Script/Engine.GameSession")).toBe("GameSession");
    expect(sectionShortName("ServerSettings")).toBe("ServerSettings");
  });

  it("updates a value inside a dotted section without rewriting structure", () => {
    const next = setIniValue(sample, "/Script/Engine.GameSession", "MaxPlayers", "40");
    expect(next).toContain("[/Script/Engine.GameSession]");
    expect(next).toContain("MaxPlayers=40");
  });

  it("uncomments a commented default instead of appending a second assignment", () => {
    const text = [
      "[ServerSettings]",
      "# Value type: string with a URL",
      "#AdminListURL=N/A",
      "AutoSavePeriodMinutes=15.0",
      "",
    ].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", '"http://127.0.0.1:8935/r/token"');

    expect(next).toContain('AdminListURL="http://127.0.0.1:8935/r/token"');
    expect(next).not.toContain("#AdminListURL");
    expect(next.match(/AdminListURL=/g)).toHaveLength(1);
    // The documentation line above it survives.
    expect(next).toContain("# Value type: string with a URL");
    expect(parseIniRows(next).filter((row) => row.key === "AdminListURL")).toHaveLength(1);
  });

  it("leaves a doubly commented line alone when writing the key", () => {
    const text = ["[ServerSettings]", "##AdminListURL=N/A", "AutoSavePeriodMinutes=15.0", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    // `##Key=…` is a line someone disabled on purpose, not the shipped default slot: it
    // stays commented, and the write appends its own assignment instead.
    expect(next).toContain("##AdminListURL=N/A");
    expect(parseIniRows(next).filter((row) => row.key === "AdminListURL")).toMatchObject([{ value: "New" }]);
  });

  it("uncomments a semicolon-style default slot too", () => {
    const text = ["[ServerSettings]", ";AdminListURL=N/A", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    expect(next).toContain("AdminListURL=New");
    expect(next).not.toContain(";AdminListURL");
    expect(next.match(/AdminListURL=/g)).toHaveLength(1);
  });

  it("keeps the indentation of an uncommented default slot", () => {
    const text = ["[ServerSettings]", "    #AdminListURL=N/A", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    expect(next).toContain("    AdminListURL=New");
  });

  it("does not uncomment the default slot when a later occurrence is requested", () => {
    const text = ["[ServerSettings]", "#AdminListURL=N/A", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "Second", 1);

    // occurrence > 0 never rewrites the shipped default slot.
    expect(next).toContain("#AdminListURL=N/A");
    expect(parseIniRows(next).filter((row) => row.key === "AdminListURL")).toHaveLength(0);
  });

  it("uncomments only the first commented occurrence of the same key", () => {
    const text = ["[ServerSettings]", "#AdminListURL=N/A", "#AdminListURL=N/A", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    expect(next.match(/^AdminListURL=New$/gm)).toHaveLength(1);
    expect(next.match(/#AdminListURL=N\/A/g)).toHaveLength(1);
  });

  it("does not uncomment a slot in a repeated section block after inserting the key", () => {
    const text = [
      "[ServerSettings]",
      "AutoSavePeriodMinutes=15.0",
      "[Other]",
      "Flag=1",
      "[ServerSettings]",
      "#AdminListURL=N/A",
      "",
    ].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    // The first [ServerSettings] block got the assignment, so the slot in the second block
    // must stay commented instead of producing a second live assignment.
    expect(next.match(/^AdminListURL=New$/gm)).toHaveLength(1);
    expect(next).toContain("#AdminListURL=N/A");
  });

  it("edits the live assignment when the key is set next to a commented default", () => {
    const text = ["[ServerSettings]", "#AdminListURL=N/A", "AdminListURL=Old", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "AdminListURL", "New");

    expect(next).toContain("AdminListURL=New");
    expect(next).toContain("#AdminListURL=N/A");
    expect(next.match(/^AdminListURL=/gm)).toHaveLength(1);
  });

  it("updates keys in existing sections even when section casing differs", () => {
    const text = ["[serversettings]", "MaxPlayers=70", ""].join("\n");

    const next = setIniTextValue(text, "ServerSettings", "MaxPlayers", "80");

    expect(next).toContain("[serversettings]");
    expect(next).toContain("MaxPlayers=80");
    expect(next.match(/\[serversettings\]/g)).toHaveLength(1);
    expect(next.match(/\[ServerSettings\]/g)).toBeNull();
  });

  it("keeps string settings as text even when the value looks numeric", () => {
    expect(
      resolveControlKind("928988", {
        valueType: "list of mod IDs, comma-separated with no spaces",
        key: "ActiveMods",
      }),
    ).toBe("text");
    expect(
      resolveControlKind("1", {
        valueType: "string",
        key: "SessionName",
      }),
    ).toBe("text");
    expect(resolveControlKind("1234", { key: "ServerPassword" })).toBe("text");
    expect(
      resolveControlKind("70", {
        valueType: "integer",
        key: "MaxPlayers",
      }),
    ).toBe("number");
    expect(resolveControlKind("True", { valueType: "boolean" })).toBe("boolean");
  });
});
