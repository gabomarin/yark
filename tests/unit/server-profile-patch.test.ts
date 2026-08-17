import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { ServerRepository } from "@backend/infra/db/server-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import { InstanceService } from "@backend/domains/instances/instance-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import {
  applyServerProfilePatch,
  isServerProfilePatch,
  serverProfileToInput,
} from "@shared/server-profile";
import type { ServerProfile, ServerProfileInput } from "@shared/types";

vi.mock("@backend/domains/instances/sync-profile-ini", () => ({
  syncProfileSettingsToIni: vi.fn(async () => undefined),
  gameUserSettingsIniPath: vi.fn(() => "C:\\asa\\island\\GameUserSettings.ini"),
}));

function input(overrides: Partial<ServerProfileInput> = {}): ServerProfileInput {
  return {
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "My Island",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: ["-NoBattlEye"],
    structuredLaunchArgs: {},
    mods: ["111"],
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    ...overrides,
  };
}

describe("server-profile patch helpers (#209)", () => {
  it("applies launch and mods patches without touching the other group", () => {
    const existing = {
      ...input(),
      id: "s1",
      enabled: true,
      createdAt: "t0",
      updatedAt: "t0",
    } satisfies ServerProfile;

    const afterLaunch = applyServerProfilePatch(existing, {
      group: "launch",
      extraArgs: ["-ForceAllowCaveFlyers"],
      structuredLaunchArgs: { forcerespawndinos: { enabled: true } },
    });
    expect(afterLaunch.extraArgs).toEqual(["-ForceAllowCaveFlyers"]);
    expect(afterLaunch.mods).toEqual(["111"]);

    const afterMods = applyServerProfilePatch(
      { ...existing, ...afterLaunch, id: "s1", enabled: true, createdAt: "t0", updatedAt: "t1" },
      {
        group: "mods",
        mods: ["111", "222"],
        disabledMods: ["222"],
      },
    );
    expect(afterMods.extraArgs).toEqual(["-ForceAllowCaveFlyers"]);
    expect(afterMods.mods).toEqual(["111", "222"]);
    expect(afterMods.disabledMods).toEqual(["222"]);
  });

  it("validates patch shapes", () => {
    expect(
      isServerProfilePatch({
        group: "launch",
        extraArgs: [],
        structuredLaunchArgs: {},
      }),
    ).toBe(true);
    expect(
      isServerProfilePatch({
        group: "mods",
        mods: ["1"],
        disabledMods: [],
      }),
    ).toBe(true);
    expect(isServerProfilePatch({ group: "launch" })).toBe(false);
    expect(isServerProfilePatch({ group: "identity" })).toBe(false);
  });

  it("serverProfileToInput drops generated fields", () => {
    const profile = {
      ...input({ mapModId: "962796" }),
      id: "s1",
      enabled: true,
      createdAt: "t0",
      updatedAt: "t1",
    } satisfies ServerProfile;
    expect(serverProfileToInput(profile)).toEqual(
      expect.objectContaining({
        mapModId: "962796",
        mods: ["111"],
      }),
    );
    expect(serverProfileToInput(profile)).not.toHaveProperty("id");
  });
});

describe("InstanceService.updatePatch concurrency (#209)", () => {
  let db: DatabaseSync;
  let repo: ServerRepository;
  let instances: InstanceService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new ServerRepository(db);
    instances = new InstanceService(
      repo,
      new EventEmitter() as unknown as ProcessManager,
      {} as BackupService,
      new InstanceLockManager(),
    );
  });

  afterEach(() => {
    db.close();
  });

  it("keeps launch args when a mods patch races after a launch patch", async () => {
    const created = repo.create(input());

    const launch = instances.updatePatch(created.id, {
      group: "launch",
      extraArgs: ["-ForceAllowCaveFlyers"],
      structuredLaunchArgs: { servergamelog: { enabled: true } },
    });
    const mods = instances.updatePatch(created.id, {
      group: "mods",
      mods: ["111", "222"],
      disabledMods: ["222"],
      modMetadataCache: {},
    });

    await Promise.all([launch, mods]);
    const final = repo.get(created.id)!;
    expect(final.extraArgs).toEqual(["-ForceAllowCaveFlyers"]);
    expect(final.structuredLaunchArgs).toEqual({
      servergamelog: { enabled: true },
    });
    expect(final.mods).toEqual(["111", "222"]);
    expect(final.disabledMods).toEqual(["222"]);
    // Settled chains drop their Map entry so deleted/churned IDs cannot leak.
    await Promise.resolve();
    expect(
      (instances as unknown as { profileWriteChains: Map<string, unknown> })
        .profileWriteChains.has(created.id),
    ).toBe(false);
  });
});
