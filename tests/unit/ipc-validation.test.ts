import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { IPC } from "@shared/ipc";
import {
  VALIDATED_IPC_CHANNELS,
  ipcArgSchemas,
} from "@shared/ipc/channel-schemas";
import {
  formatZodError,
  serverIdSchema,
  windowsAbsPathSchema,
} from "@shared/ipc/primitives";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (...args: unknown[]) => handleMock(...args),
  },
}));

describe("validated IPC schema registry", () => {
  it("lists every validated channel exactly once with a matching schema", () => {
    const unique = new Set(VALIDATED_IPC_CHANNELS);
    expect(unique.size).toBe(VALIDATED_IPC_CHANNELS.length);
    for (const channel of VALIDATED_IPC_CHANNELS) {
      expect(ipcArgSchemas[channel]).toBeDefined();
    }
    expect(Object.keys(ipcArgSchemas).sort()).toEqual(
      [...VALIDATED_IPC_CHANNELS].sort(),
    );
  });

  it("covers every invokable IPC channel in the shared contract", () => {
    const allInvokeChannels = Object.values(IPC).sort();
    const validated = [...VALIDATED_IPC_CHANNELS].sort();
    expect(validated).toEqual(allInvokeChannels);
  });
});

describe("ipc primitives", () => {
  it("accepts absolute Windows paths and rejects relative ones", () => {
    expect(windowsAbsPathSchema.safeParse("C:\\ARK\\Island").success).toBe(true);
    expect(windowsAbsPathSchema.safeParse("\\\\nas\\share\\ark").success).toBe(true);
    expect(windowsAbsPathSchema.safeParse("relative\\path").success).toBe(false);
    expect(windowsAbsPathSchema.safeParse("").success).toBe(false);
  });

  it("rejects empty server ids", () => {
    expect(serverIdSchema.safeParse("").success).toBe(false);
    expect(serverIdSchema.safeParse("  ").success).toBe(false);
    expect(serverIdSchema.safeParse("srv-1").success).toBe(true);
  });

  it("formats the first Zod issue for IPC errors", () => {
    const parsed = z.tuple([serverIdSchema]).safeParse([123]);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(formatZodError(parsed.error)).toMatch(/^Invalid IPC arguments/);
  });
});

describe("validated arg schemas (reject)", () => {
  it("rejects non-boolean enabled flag", () => {
    const parsed = ipcArgSchemas[IPC.serversSetEnabled].safeParse([
      "srv-1",
      "yes",
    ]);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid start options keys", () => {
    const parsed = ipcArgSchemas[IPC.serversStart].safeParse([
      "srv-1",
      { skipPortValidation: true, unexpected: true },
    ]);
    expect(parsed.success).toBe(false);
  });

  it("accepts start with one arg or nullish options", () => {
    expect(ipcArgSchemas[IPC.serversStart].safeParse(["srv-1"]).success).toBe(true);
    expect(
      ipcArgSchemas[IPC.serversStart].safeParse(["srv-1", null]).success,
    ).toBe(true);
    expect(
      ipcArgSchemas[IPC.serversStart].safeParse(["srv-1", undefined]).success,
    ).toBe(true);
  });

  it("accepts pickPath with 1–3 args and null middle", () => {
    expect(ipcArgSchemas[IPC.pickPath].safeParse(["directory"]).success).toBe(true);
    expect(
      ipcArgSchemas[IPC.pickPath].safeParse(["directory", "C:\\ARK"]).success,
    ).toBe(true);
    expect(
      ipcArgSchemas[IPC.pickPath].safeParse(["file", null, "Import ZIP"]).success,
    ).toBe(true);
    expect(
      ipcArgSchemas[IPC.pickPath].safeParse(["save", "C:\\out.zip", "Export"]).success,
    ).toBe(true);
  });

  it("rejects relative move destination", () => {
    const parsed = ipcArgSchemas[IPC.serversMoveInstall].safeParse([
      "srv-1",
      "not\\absolute",
    ]);
    expect(parsed.success).toBe(false);
  });

  it("trims absolute paths before regex", () => {
    expect(
      ipcArgSchemas[IPC.steamcmdSetPath].safeParse(["  C:\\Steam\\steamcmd.exe  "])
        .success,
    ).toBe(true);
  });

  it("rejects whitespace-only RCON but keeps intentional leading spaces", () => {
    expect(ipcArgSchemas[IPC.rconCommand].safeParse(["srv-1", ""]).success).toBe(
      false,
    );
    expect(ipcArgSchemas[IPC.rconCommand].safeParse(["srv-1", "   "]).success).toBe(
      false,
    );
    expect(ipcArgSchemas[IPC.rconCommand].safeParse(["srv-1", " ListPlayers"]).success).toBe(
      true,
    );
  });

  it("rejects unknown steamcmd cache kind", () => {
    const parsed = ipcArgSchemas[IPC.steamcmdClearCache].safeParse(["temp"]);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid profile patch", () => {
    const parsed = ipcArgSchemas[IPC.serversUpdatePatch].safeParse([
      "srv-1",
      { group: "launch" },
    ]);
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid launch patch", () => {
    const parsed = ipcArgSchemas[IPC.serversUpdatePatch].safeParse([
      "srv-1",
      { group: "launch", extraArgs: [], structuredLaunchArgs: {} },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("rejects backup cleanup with unknown fields", () => {
    const parsed = ipcArgSchemas[IPC.backupsRunCleanup].safeParse([
      {
        serverIds: null,
        includeFailed: true,
        enforceRetention: true,
        olderThanDays: null,
        keepLastPerKind: null,
        protectNewestWorld: true,
        wipeAll: true,
      },
    ]);
    expect(parsed.success).toBe(false);
  });

  it("rejects path traversal in update log file names", () => {
    expect(
      ipcArgSchemas[IPC.logsDeleteUpdate].safeParse(["srv-1", "../secret.log"])
        .success,
    ).toBe(false);
    expect(
      ipcArgSchemas[IPC.logsDeleteUpdate].safeParse(["srv-1", "srv-1-foo..bar.log"])
        .success,
    ).toBe(false);
    expect(
      ipcArgSchemas[IPC.logsOpenUpdateFile].safeParse([
        "srv-1",
        "srv-1-ok.log:ads",
      ]).success,
    ).toBe(false);
  });

  it("accepts omitted cluster file selection and empty global cleanup serverId", () => {
    expect(
      ipcArgSchemas[IPC.clusterIniRestore].safeParse(["cluster-a", "srv-1"]).success,
    ).toBe(true);
    expect(
      ipcArgSchemas[IPC.clusterIniRestore].safeParse([
        "cluster-a",
        "srv-1",
        null,
      ]).success,
    ).toBe(true);
    expect(
      ipcArgSchemas[IPC.logsRunCleanup].safeParse([
        {
          confirmedTargets: [
            { category: "events", serverId: "", targetKey: "12" },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it("accepts backup policy with empty backupDir coerced to null", () => {
    const parsed = ipcArgSchemas[IPC.backupsSetPolicy].safeParse([
      "srv-1",
      {
        enabled: true,
        intervalMinutes: 60,
        retainCountWorld: 20,
        retainCountPlayers: 20,
        retainCountIni: 10,
        backupDir: "   ",
      },
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[1].backupDir).toBeNull();
    }
  });

  it("accepts optional limit omits for list/runtime/search/console", () => {
    expect(ipcArgSchemas[IPC.logsRuntime].safeParse(["srv-1"]).success).toBe(true);
    expect(ipcArgSchemas[IPC.backupsList].safeParse(["srv-1"]).success).toBe(true);
    expect(ipcArgSchemas[IPC.steamcmdConsole].safeParse([]).success).toBe(true);
    expect(ipcArgSchemas[IPC.modsSearch].safeParse([""]).success).toBe(true);
    expect(ipcArgSchemas[IPC.modsListCategories].safeParse([]).success).toBe(true);
  });

  it("accepts Discover search filter options (#297)", () => {
    expect(
      ipcArgSchemas[IPC.modsSearch].safeParse([
        "",
        {
          index: 20,
          pageSize: 20,
          classId: 6,
          sortField: 2,
          sortOrder: "desc",
        },
      ]).success,
    ).toBe(true);
  });

  it("rejects oversize paths and mods pagination past CurseForge limits", () => {
    const longPath = `C:\\${"a".repeat(4200)}`;
    expect(ipcArgSchemas[IPC.steamcmdSetPath].safeParse([longPath]).success).toBe(
      false,
    );
    expect(
      ipcArgSchemas[IPC.modsSearch].safeParse([
        "query",
        { index: 10_000, pageSize: 50 },
      ]).success,
    ).toBe(false);
  });

  it("rejects disk-alert settings that violate warn/critical floors", () => {
    expect(
      ipcArgSchemas[IPC.backupsSetDiskAlertSettings].safeParse([
        {
          warnUsedPercent: 40,
          criticalUsedPercent: 95,
          warnFreeBytes: 20 * 1024 ** 3,
        },
      ]).success,
    ).toBe(false);
    expect(
      ipcArgSchemas[IPC.backupsSetDiskAlertSettings].safeParse([
        {
          warnUsedPercent: 90,
          criticalUsedPercent: 90,
          warnFreeBytes: 20 * 1024 ** 3,
        },
      ]).success,
    ).toBe(false);
  });

  it("rejects log retention when failure days are below routine days", () => {
    expect(
      ipcArgSchemas[IPC.logsSetRetentionSettings].safeParse([
        {
          eventsRetainDays: 90,
          eventsFailureRetainDays: 30,
          updateLogsRetainCount: 20,
          updateLogsFailureRetainDays: 180,
          autoCleanupEnabled: true,
        },
      ]).success,
    ).toBe(false);
  });
});

describe("handleValidated", () => {
  beforeEach(() => {
    handleMock.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    const { resetValidatedIpcChannelsForTests } = await import("../../src/main/ipc-validate");
    resetValidatedIpcChannelsForTests();
  });

  it("returns ok:false without calling the domain fn when args fail", async () => {
    const { handleValidated } = await import("../../src/main/ipc-validate");
    const domain = vi.fn(async () => "done");
    handleValidated("test:validated-channel", z.tuple([serverIdSchema]), domain);

    expect(handleMock).toHaveBeenCalledTimes(1);
    const handler = handleMock.mock.calls[0]?.[1] as (
      event: unknown,
      ...args: unknown[]
    ) => Promise<{ ok: boolean; error?: string; data?: string }>;

    const result = await handler({}, 42);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid IPC arguments/);
    expect(domain).not.toHaveBeenCalled();
  });

  it("calls the domain fn with parsed args when valid", async () => {
    const { handleValidated } = await import("../../src/main/ipc-validate");
    const domain = vi.fn(async ([id]: [string]) => `got:${id}`);
    handleValidated("test:validated-channel-ok", z.tuple([serverIdSchema]), domain);

    const handler = handleMock.mock.calls[0]?.[1] as (
      event: unknown,
      ...args: unknown[]
    ) => Promise<{ ok: boolean; data?: string }>;

    const result = await handler({}, "srv-9");
    expect(result).toEqual({ ok: true, data: "got:srv-9" });
    expect(domain).toHaveBeenCalledWith(["srv-9"]);
  });

  it("redacts credential assignments in IPC error strings", async () => {
    const { handleValidated } = await import("../../src/main/ipc-validate");
    handleValidated("test:secret-err", z.tuple([]), () => {
      throw new Error("INI write failed ServerAdminPassword=hunter2-secret");
    });

    const handler = handleMock.mock.calls[0]?.[1] as (
      event: unknown,
      ...args: unknown[]
    ) => Promise<{ ok: boolean; error?: string }>;

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("hunter2-secret");
    expect(result.error).toContain("••••••••");
  });

  it("redacts known live secrets in IPC error strings", async () => {
    const { handleValidated, setIpcDiagnosticKnownSecrets } = await import(
      "../../src/main/ipc-validate"
    );
    setIpcDiagnosticKnownSecrets(() => ["hunter2-secret"]);
    handleValidated("test:bare-secret-err", z.tuple([]), () => {
      throw new Error("RCON rejected hunter2-secret from 127.0.0.1");
    });

    const handler = handleMock.mock.calls[0]?.[1] as (
      event: unknown,
      ...args: unknown[]
    ) => Promise<{ ok: boolean; error?: string }>;

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("hunter2-secret");
    expect(result.error).toContain("••••••••");
  });

  it("refuses duplicate channel registration", async () => {
    const { handleValidated } = await import("../../src/main/ipc-validate");
    const schema = z.tuple([]);
    handleValidated("test:dup", schema, () => undefined);
    expect(() => handleValidated("test:dup", schema, () => undefined)).toThrow(
      /already registered/,
    );
  });
});
