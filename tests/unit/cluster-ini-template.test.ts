import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { ClusterIniTemplateRepository } from "@backend/infra/db/cluster-ini-template-repository";
import {
  ClusterIniTemplateService,
  defaultClusterIniTemplatePayload,
  prepareClusterIniTemplatePayload,
} from "@backend/domains/config/cluster-ini-template-service";

describe("ClusterIniTemplateRepository / Service", () => {
  let db: DatabaseSync;

  afterEach(() => {
    db?.close();
  });

  function makeService(): ClusterIniTemplateService {
    db = openDatabase(":memory:");
    return new ClusterIniTemplateService(new ClusterIniTemplateRepository(db));
  }

  it("migrates cluster_ini_templates and round-trips payload", () => {
    const service = makeService();
    const payload = prepareClusterIniTemplatePayload({
      gameUserSettings: `[ServerSettings]\nMaxPlayers=55\nRCONPort=27020\n`,
      game: `[/Script/ShooterGame.ShooterGameMode]\nHarvestAmountMultiplier=3\n`,
    });

    const { template, preview } = service.save("alpha", payload);
    expect(template.clusterId).toBe("alpha");
    expect(template.payload.gameUserSettings).toContain("MaxPlayers=55");
    expect(template.payload.gameUserSettings).not.toMatch(/RCONPort=/i);
    expect(template.payload.game).toContain("HarvestAmountMultiplier=3");
    expect(preview.valid).toBe(true);

    const loaded = service.get("alpha");
    expect(loaded?.payload).toEqual(template.payload);
  });

  it("getOrDraft seeds defaults without persisting until save", () => {
    const service = makeService();
    expect(service.get("beta")).toBeNull();
    const draft = service.getOrDraft("beta");
    expect(draft.payload).toEqual(defaultClusterIniTemplatePayload());
    expect(service.get("beta")).toBeNull();
  });

  it("delete removes template only", () => {
    const service = makeService();
    service.save("gamma", {
      gameUserSettings: `[ServerSettings]\nMaxPlayers=10\n`,
      game: "",
    });
    expect(service.delete("gamma")).toBe(true);
    expect(service.get("gamma")).toBeNull();
    expect(service.delete("gamma")).toBe(false);
  });

  it("round-trips unknown sections, keys, and comments in both INI files", () => {
    const service = makeService();
    const gus = [
      "[ServerSettings]",
      "MaxPlayers=40",
      "# custom note",
      "CustomUnknownKey=hello",
      "",
      "[/Custom.Mod.Section]",
      "ModOnlyFlag=True",
      "",
    ].join("\n");
    const game = [
      "[/Script/ShooterGame.ShooterGameMode]",
      "HarvestAmountMultiplier=2",
      "WeirdCustomMultiplier=1.5",
      "",
      "[CustomGameSection]",
      "KeepMe=1",
      "",
    ].join("\n");

    const { template } = service.save("delta", {
      gameUserSettings: gus,
      game,
    });
    expect(template.payload.gameUserSettings).toContain("CustomUnknownKey=hello");
    expect(template.payload.gameUserSettings).toContain("# custom note");
    expect(template.payload.gameUserSettings).toContain("[/Custom.Mod.Section]");
    expect(template.payload.gameUserSettings).toContain("ModOnlyFlag=True");
    expect(template.payload.game).toContain("WeirdCustomMultiplier=1.5");
    expect(template.payload.game).toContain("[CustomGameSection]");
    expect(template.payload.game).toContain("KeepMe=1");

    const loaded = service.get("delta");
    expect(loaded?.payload).toEqual(template.payload);
  });

  it("delete only drops the SQLite row (no other cluster templates affected)", () => {
    const service = makeService();
    service.save("keep", {
      gameUserSettings: `[ServerSettings]\nMaxPlayers=20\n`,
      game: `[Custom]\nA=1\n`,
    });
    service.save("drop", {
      gameUserSettings: `[ServerSettings]\nMaxPlayers=30\n`,
      game: "",
    });

    expect(service.delete("drop")).toBe(true);
    expect(service.get("drop")).toBeNull();
    const kept = service.get("keep");
    expect(kept?.payload.gameUserSettings).toContain("MaxPlayers=20");
    expect(kept?.payload.game).toContain("A=1");
  });

  it("rejects invalid MaxPlayers on save", () => {
    const service = makeService();
    expect(() =>
      service.save("bad", {
        gameUserSettings: `[ServerSettings]\nMaxPlayers=999\n`,
        game: "",
      }),
    ).toThrow(/MaxPlayers/);
  });
});
