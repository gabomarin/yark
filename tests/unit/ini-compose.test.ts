import { describe, expect, it } from "vitest";
import {
  applyProfileOwnedKeysToGameUserSettings,
  composeMemberPayloadFromTemplate,
  composeTemplatePayloadFromMember,
  finalizeClusterIniApplyPreview,
  omitYarkOwnedFromIniPreview,
  redactIniPreviewSecrets,
  resolveMemberIdentity,
} from "@backend/domains/config/ini-compose";
import { buildIniPreview } from "@backend/domains/config/ini-preview";

const profileA = {
  rconPort: 27020,
  adminPassword: "admin-a",
  serverPassword: "join-a",
  sessionName: "The Island",
  gamePort: 7777,
  queryPort: 27015,
};

const profileB = {
  rconPort: 27030,
  adminPassword: "admin-b",
  serverPassword: "join-b",
  sessionName: "Gabo Scorched yark-copy",
  gamePort: 7787,
  queryPort: 27025,
};

describe("ini-compose", () => {
  it("applies profile-owned keys without dropping unrelated settings", () => {
    const text = applyProfileOwnedKeysToGameUserSettings(
      "[ServerSettings]\nMaxPlayers=40\nXPMultiplier=1.5\n",
      profileA,
    );
    expect(text).toContain("MaxPlayers=40");
    expect(text).toContain("XPMultiplier=1.5");
    expect(text).toContain("RCONPort=27020");
    expect(text).toContain("ServerAdminPassword=admin-a");
    expect(text).toContain("SessionName=The Island");
    expect(text).toContain("Port=7777");
    expect(text).toContain("QueryPort=27015");
  });

  it("composes member payload from template then reapplies owned keys", () => {
    const composed = composeMemberPayloadFromTemplate(
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=3\nRCONPort=11111\nServerAdminPassword=from-template\n",
        game: "[/Script/ShooterGame.ShooterGameMode]\nHarvestAmountMultiplier=2\n",
      },
      profileA,
    );
    expect(composed.gameUserSettings).toContain("XPMultiplier=3");
    expect(composed.gameUserSettings).toContain("RCONPort=27020");
    expect(composed.gameUserSettings).toContain("ServerAdminPassword=admin-a");
    expect(composed.gameUserSettings).not.toContain("from-template");
    expect(composed.game).toContain("HarvestAmountMultiplier=2");
  });

  it("preserves target Server Information when restoring a template promoted from another server", () => {
    const fromB = composeTemplatePayloadFromMember({
      gameUserSettings: [
        "[ServerSettings]",
        "MaxPlayers=55",
        "XPMultiplier=3",
        "RCONPort=27030",
        "ServerAdminPassword=admin-b",
        "ServerPassword=join-b",
        "",
        "[SessionSettings]",
        "SessionName=Gabo Scorched yark-copy",
        "Port=7787",
        "QueryPort=27025",
        "",
      ].join("\n"),
      game: "[Custom]\nSharedFlag=True\n",
    });

    expect(fromB.gameUserSettings).toContain("MaxPlayers=55");
    expect(fromB.gameUserSettings).toContain("XPMultiplier=3");
    expect(fromB.gameUserSettings).not.toMatch(/RCONPort=/i);
    expect(fromB.gameUserSettings).not.toMatch(/SessionName=/i);
    expect(fromB.gameUserSettings).not.toMatch(/Port=/i);

    const currentA = {
      gameUserSettings: [
        "[ServerSettings]",
        "MaxPlayers=20",
        "XPMultiplier=1",
        "RCONPort=27020",
        "ServerAdminPassword=admin-a",
        "ServerPassword=join-a",
        "",
        "[SessionSettings]",
        "SessionName=The Island",
        "Port=7777",
        "QueryPort=27015",
        "",
      ].join("\n"),
      game: "[Custom]\nSharedFlag=False\n",
    };

    // Even if the wrong profile were passed, current INI identity wins.
    const restored = composeMemberPayloadFromTemplate(
      fromB,
      profileB,
      currentA,
    );

    expect(restored.gameUserSettings).toContain("MaxPlayers=55");
    expect(restored.gameUserSettings).toContain("XPMultiplier=3");
    expect(restored.gameUserSettings).toContain("RCONPort=27020");
    expect(restored.gameUserSettings).toContain("ServerAdminPassword=admin-a");
    expect(restored.gameUserSettings).toContain("SessionName=The Island");
    expect(restored.gameUserSettings).toContain("Port=7777");
    expect(restored.gameUserSettings).toContain("QueryPort=27015");
    expect(restored.gameUserSettings).not.toContain("27030");
    expect(restored.gameUserSettings).not.toContain("7787");
    expect(restored.gameUserSettings).not.toContain("Gabo Scorched");
    expect(restored.game).toContain("SharedFlag=True");

    const preview = finalizeClusterIniApplyPreview(
      buildIniPreview(currentA, restored),
    );
    expect(preview.diff.some((row) => row.key === "RCONPort")).toBe(false);
    expect(preview.diff.some((row) => row.key === "SessionName")).toBe(false);
    expect(preview.diff.some((row) => row.key === "Port")).toBe(false);
    expect(preview.diff.some((row) => row.key === "XPMultiplier")).toBe(true);
  });

  it("resolveMemberIdentity prefers on-disk Server Information over profile", () => {
    const identity = resolveMemberIdentity(
      profileB,
      [
        "[ServerSettings]",
        "RCONPort=27020",
        "ServerAdminPassword=admin-a",
        "",
        "[SessionSettings]",
        "SessionName=The Island",
        "Port=7777",
        "QueryPort=27015",
        "",
      ].join("\n"),
    );
    expect(identity).toEqual({
      rconPort: 27020,
      adminPassword: "admin-a",
      serverPassword: profileB.serverPassword,
      sessionName: "The Island",
      gamePort: 7777,
      queryPort: 27015,
    });
  });

  it("strips owned keys when promoting member content into a template", () => {
    const template = composeTemplatePayloadFromMember({
      gameUserSettings:
        "[ServerSettings]\nMaxPlayers=55\nRCONPort=27020\nServerAdminPassword=x\nActiveMods=1,2\n",
      game: "[Custom]\nKeep=1\n",
    });
    expect(template.gameUserSettings).toContain("MaxPlayers=55");
    expect(template.gameUserSettings).not.toMatch(/RCONPort=/i);
    expect(template.gameUserSettings).not.toMatch(/ServerAdminPassword=/i);
    expect(template.gameUserSettings).not.toMatch(/ActiveMods=/i);
    expect(template.game).toContain("Keep=1");
  });

  it("omits owned keys from operator previews", () => {
    const preview = buildIniPreview(
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=1\nRCONPort=27020\n",
        game: "",
      },
      {
        gameUserSettings:
          "[ServerSettings]\nXPMultiplier=3\nRCONPort=27030\n",
        game: "",
      },
    );
    const filtered = omitYarkOwnedFromIniPreview(preview);
    expect(filtered.diff.some((row) => row.key === "RCONPort")).toBe(false);
    expect(filtered.diff.some((row) => row.key === "XPMultiplier")).toBe(true);
    expect(filtered.changedCount).toBe(1);
  });

  it("redacts password values in previews", () => {
    const preview = buildIniPreview(
      {
        gameUserSettings: "[ServerSettings]\nServerAdminPassword=old\n",
        game: "",
      },
      {
        gameUserSettings: "[ServerSettings]\nServerAdminPassword=new\n",
        game: "",
      },
    );
    const redacted = redactIniPreviewSecrets(preview);
    const entry = redacted.diff.find((row) => row.key === "ServerAdminPassword");
    expect(entry?.before).toBe("••••••••");
    expect(entry?.after).toBe("••••••••");
  });

  it("redacts password keys case-insensitively", () => {
    const preview = buildIniPreview(
      {
        gameUserSettings: "[ServerSettings]\nserverpassword=old\n",
        game: "",
      },
      {
        gameUserSettings: "[ServerSettings]\nserverpassword=new\n",
        game: "",
      },
    );
    const redacted = redactIniPreviewSecrets(preview);
    const entry = redacted.diff.find(
      (row) => row.key.toLowerCase() === "serverpassword",
    );
    expect(entry?.before).toBe("••••••••");
    expect(entry?.after).toBe("••••••••");
  });
});
