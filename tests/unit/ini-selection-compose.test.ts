import { describe, expect, it } from "vitest";
import {
  composeModLists,
  composeStringList,
  emptyConfigTransferSelection,
  emptyIniFileSelection,
} from "@shared/config-transfer";
import { removeIniTextValue } from "@shared/ini-text";
import {
  composeIniFileFromSelection,
  composeIniPayloadFromSelection,
} from "@backend/domains/config/ini-selection-compose";

describe("removeIniTextValue", () => {
  it("removes a key while keeping siblings", () => {
    const text = "[ServerSettings]\nXPMultiplier=1\nMaxPlayers=40\n";
    const next = removeIniTextValue(text, "ServerSettings", "XPMultiplier");
    expect(next).not.toContain("XPMultiplier");
    expect(next).toContain("MaxPlayers=40");
  });
});

describe("composeIniFileFromSelection", () => {
  const source = [
    "[ServerSettings]",
    "XPMultiplier=3",
    "TamingSpeedMultiplier=5",
    "ServerAdminPassword=from-source",
    "",
  ].join("\n");
  const target = [
    "[ServerSettings]",
    "XPMultiplier=1",
    "MaxPlayers=40",
    "ServerAdminPassword=target-secret",
    "",
  ].join("\n");

  it("merges selected keys and skips owned password keys", () => {
    const selection = {
      ...emptyIniFileSelection("merge"),
      enabled: true,
      keys: [
        { section: "ServerSettings", key: "XPMultiplier" },
        { section: "ServerSettings", key: "ServerAdminPassword" },
      ],
    };
    const next = composeIniFileFromSelection(
      source,
      target,
      selection,
      "gameUserSettings",
    );
    expect(next).toContain("XPMultiplier=3");
    expect(next).toContain("MaxPlayers=40");
    expect(next).toContain("ServerAdminPassword=target-secret");
    expect(next).not.toContain("from-source");
  });

  it("replace section removes target-only keys in that section", () => {
    const selection = {
      ...emptyIniFileSelection("replace"),
      enabled: true,
      sections: ["ServerSettings"],
    };
    const next = composeIniFileFromSelection(
      source,
      target,
      selection,
      "gameUserSettings",
    );
    expect(next).toContain("XPMultiplier=3");
    expect(next).toContain("TamingSpeedMultiplier=5");
    expect(next).not.toContain("MaxPlayers=40");
    // Owned password key in source is filtered from copy; target password
    // may be removed by section replace then not re-added here (payload
    // compose reapplies owned keys afterward).
  });

  it("entire-file merge updates source keys without wiping extras", () => {
    const selection = {
      ...emptyIniFileSelection("merge"),
      enabled: true,
      entireFile: true,
    };
    const next = composeIniFileFromSelection(
      source,
      target,
      selection,
      "gameUserSettings",
    );
    expect(next).toContain("XPMultiplier=3");
    expect(next).toContain("TamingSpeedMultiplier=5");
    expect(next).toContain("MaxPlayers=40");
  });

  it("entire-file replace rebuilds from filtered keys and skips ASE ActiveMods", () => {
    const sourceWithMods = [
      "[ServerSettings]",
      "XPMultiplier=3",
      "ActiveMods=999,888",
      "ServerAdminPassword=from-source",
      "",
    ].join("\n");
    const selection = {
      ...emptyIniFileSelection("replace"),
      enabled: true,
      entireFile: true,
    };
    const next = composeIniFileFromSelection(
      sourceWithMods,
      target,
      selection,
      "gameUserSettings",
    );
    expect(next).toContain("XPMultiplier=3");
    expect(next).not.toContain("ActiveMods");
    expect(next).not.toContain("from-source");
    expect(next).not.toContain("MaxPlayers=40");
  });
});

describe("composeIniPayloadFromSelection", () => {
  it("reapplies target ports and session after merge", () => {
    const selection = emptyConfigTransferSelection();
    selection.gameUserSettings = {
      enabled: true,
      strategy: "merge",
      entireFile: true,
      sections: [],
      keys: [],
    };
    const composed = composeIniPayloadFromSelection(
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=9\nRCONPort=11111\nServerAdminPassword=src\n\n[SessionSettings]\nSessionName=FromSource\nPort=1\nQueryPort=2\n",
        game: "",
      },
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=1\nRCONPort=27020\nServerAdminPassword=tgt\n\n[SessionSettings]\nSessionName=TargetSession\nPort=7777\nQueryPort=27015\n",
        game: "",
      },
      selection,
      {
        rconPort: 27020,
        adminPassword: "tgt",
        serverPassword: null,
        sessionName: "TargetSession",
        gamePort: 7777,
        queryPort: 27015,
      },
    );
    expect(composed.gameUserSettings).toContain("XPMultiplier=9");
    expect(composed.gameUserSettings).toContain("RCONPort=27020");
    expect(composed.gameUserSettings).toContain("ServerAdminPassword=tgt");
    expect(composed.gameUserSettings).toContain("SessionName=TargetSession");
    expect(composed.gameUserSettings).toContain("Port=7777");
  });

  it("Game.ini-only copy leaves target GameUserSettings unchanged", () => {
    const selection = emptyConfigTransferSelection();
    selection.game = {
      enabled: true,
      strategy: "merge",
      entireFile: true,
      sections: [],
      keys: [],
    };
    const composed = composeIniPayloadFromSelection(
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=9\nRCONPort=11111\n",
        game: "[/Script/ShooterGame.ShooterGameMode]\nBabyMatureSpeedMultiplier=10\n",
      },
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=1\nRCONPort=27020\n",
        game: "[/Script/ShooterGame.ShooterGameMode]\nBabyMatureSpeedMultiplier=1\n",
      },
      selection,
      {
        rconPort: 27020,
        adminPassword: "tgt",
        serverPassword: null,
        sessionName: "TargetSession",
        gamePort: 7777,
        queryPort: 27015,
      },
    );
    expect(composed.gameUserSettings).toBe(
      "[ServerSettings]\nXPMultiplier=1\nRCONPort=27020\n",
    );
    expect(composed.game).toContain("BabyMatureSpeedMultiplier=10");
  });
});

describe("composeStringList / composeModLists", () => {
  it("merges lists without duplicates and replaces wholesale", () => {
    expect(
      composeStringList(["-a", "-b"], ["-b", "-c"], "merge"),
    ).toEqual(["-b", "-c", "-a"]);
    expect(composeStringList(["-a", "-b"], ["-b", "-c"], "replace")).toEqual([
      "-a",
      "-b",
    ]);
  });

  it("merges mods keeping target order and unioning disabled flags", () => {
    const merged = composeModLists(
      {
        mods: ["100", "200"],
        disabledMods: ["200"],
        modMetadataCache: { "200": { name: "src" } },
      },
      {
        mods: ["100", "300"],
        disabledMods: ["300"],
        modMetadataCache: { "100": { name: "tgt" } },
      },
      "merge",
    );
    expect(merged.mods).toEqual(["100", "300", "200"]);
    expect(merged.disabledMods.sort()).toEqual(["200", "300"]);
    expect(merged.modMetadataCache).toMatchObject({
      "100": { name: "tgt" },
      "200": { name: "src" },
    });
  });
});
