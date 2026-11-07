import { describe, expect, it } from "vitest";
import { applyProfileOwnedKeysToGameUserSettings } from "@backend/domains/config/ini-compose";
import { defaultGameUserSettingsIni } from "@shared/ini/ini-defaults";
import { getIniTextValueAt } from "@shared/ini/ini-semantic-ops";

describe("new-server GUS seed", () => {
  it("applies suggested ports and admin password onto the default template", () => {
    const seeded = applyProfileOwnedKeysToGameUserSettings(defaultGameUserSettingsIni, {
      rconPort: 27030,
      adminPassword: "seed-admin",
      serverPassword: null,
      sessionName: "Fresh Server",
      maxPlayers: 70,
      gamePort: 7787,
      queryPort: 27025,
    });

    expect(getIniTextValueAt(seeded, "SessionSettings", "SessionName", 0)).toBe("Fresh Server");
    expect(getIniTextValueAt(seeded, "SessionSettings", "Port", 0)).toBe("7787");
    expect(getIniTextValueAt(seeded, "SessionSettings", "QueryPort", 0)).toBe("27025");
    expect(getIniTextValueAt(seeded, "ServerSettings", "RCONPort", 0)).toBe("27030");
    expect(getIniTextValueAt(seeded, "ServerSettings", "RCONEnabled", 0)).toBe("True");
    expect(getIniTextValueAt(seeded, "ServerSettings", "ServerAdminPassword", 0)).toBe("seed-admin");
    expect(seeded).toMatch(/^\[ScalabilityGroups\]\s*$/m);
  });
});
