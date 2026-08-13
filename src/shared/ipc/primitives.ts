import { z } from "zod";
import { PORT_MAX, PORT_MIN } from "../types";
import { MAX_WINDOWS_PATH_LENGTH } from "../server-install-path";
import {
  MAX_LOG_RETENTION_DAYS,
  MIN_LOG_RETENTION_DAYS,
} from "../log-retention";

/** Absolute Windows path (drive letter or UNC). */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

export const MAX_SERVER_ID_LENGTH = 128;
export const MAX_PATH_LENGTH = MAX_WINDOWS_PATH_LENGTH;
export const MAX_RCON_COMMAND_LENGTH = 2_000;
export const MAX_BACKUP_ID_LENGTH = 256;
export const MAX_BACKUP_IDS_PER_REQUEST = 200;
export const MAX_STRING_PARAM_LENGTH = 512;
export const MAX_PLAYER_KEY_LENGTH = 256;
export const MAX_INI_FILE_CHARS = 2_000_000;
export const MAX_MOD_IDS_PER_REQUEST = 200;
export const MAX_MOD_QUERY_LENGTH = 200;
export const MAX_LOG_FILE_NAME_LENGTH = 255;
export const MAX_URL_LENGTH = 2_048;

/**
 * Zod 3 tuples treat `.optional()` slots as still requiring that array length.
 * Pad short invoke arg lists with `undefined` so 1-/2-arg calls work.
 */
export function padIpcArgs(minLength: number): (raw: unknown) => unknown {
  return (raw) => {
    if (!Array.isArray(raw)) {
      return raw;
    }
    if (raw.length >= minLength) {
      return raw;
    }
    const padded = raw.slice();
    while (padded.length < minLength) {
      padded.push(undefined);
    }
    return padded;
  };
}

/** Tuple schema that accepts shorter arg lists by padding with `undefined`. */
export function ipcTuple<T extends [z.ZodTypeAny, ...z.ZodTypeAny[]]>(
  ...items: T
): z.ZodEffects<z.ZodTuple<T>, z.output<z.ZodTuple<T>>, unknown> {
  return z.preprocess(padIpcArgs(items.length), z.tuple(items));
}

export const serverIdSchema = z
  .string()
  .min(1, "Server id required")
  .max(MAX_SERVER_ID_LENGTH, "Server id too long")
  .refine((value) => value.trim() === value, {
    message: "Server id must not have leading or trailing whitespace",
  });

export const clusterIdSchema = z
  .string()
  .min(1, "Cluster id required")
  .max(MAX_SERVER_ID_LENGTH, "Cluster id too long")
  .refine((value) => value.trim() === value, {
    message: "Cluster id must not have leading or trailing whitespace",
  });

export const nonEmptyStringSchema = (label: string, max = MAX_STRING_PARAM_LENGTH) =>
  z
    .string()
    .trim()
    .min(1, `${label} required`)
    .max(max, `${label} too long`);

/** Free-text commands — do not trim (leading spaces may be meaningful). */
export const rconCommandTextSchema = z
  .string()
  .min(1, "RCON command required")
  .max(MAX_RCON_COMMAND_LENGTH, "RCON command too long")
  .refine((value) => value.trim().length > 0, {
    message: "RCON command required",
  });

export const playerKeySchema = nonEmptyStringSchema("Player key", MAX_PLAYER_KEY_LENGTH);

export const windowsAbsPathSchema = z
  .string()
  .trim()
  .min(3, "Path required")
  .max(MAX_PATH_LENGTH, "Path too long")
  .regex(WINDOWS_ABS_PATH, "Must be an absolute Windows path");

export const portSchema = z
  .number()
  .int()
  .min(PORT_MIN, `Port must be >= ${PORT_MIN}`)
  .max(PORT_MAX, `Port must be <= ${PORT_MAX}`);

export const steamCmdCacheKindSchema = z.enum(["depot", "content"]);

export const backupKindSchema = z.enum(["world", "players", "ini"]);

export const pickPathKindSchema = z.enum(["directory", "file", "save"]);

export const appDataFolderKindSchema = z.enum([
  "app",
  "backups",
  "updateLogs",
  "steamcmd",
]);

export const iniFileKeySchema = z.enum(["gameUserSettings", "game"]);

export const uiDensitySchema = z.enum(["comfortable", "compact"]);

export const installationServersModeSchema = z.union([
  z.boolean(),
  z.literal("when-official-changed"),
]);

export const logFileNameSchema = z
  .string()
  .min(1, "Log file name required")
  .max(MAX_LOG_FILE_NAME_LENGTH, "Log file name too long")
  .refine(
    (name) =>
      name !== "." &&
      name !== ".." &&
      !name.includes("..") &&
      !name.includes("/") &&
      !name.includes("\\") &&
      !name.includes(":") &&
      !name.includes("\0"),
    { message: "Invalid log file name" },
  );

/** Non-array plain object (profile / selection payloads refined in domain). */
export const plainObjectSchema = z
  .object({})
  .passthrough()
  .refine((value) => value !== null && !Array.isArray(value), {
    message: "Expected an object",
  });

export const sessionPortSetSchema = z.object({
  gamePort: portSchema,
  queryPort: portSchema,
  rconPort: portSchema,
});

export const startServerOptionsSchema = z
  .object({
    skipPortValidation: z.boolean().optional(),
    sessionPorts: sessionPortSetSchema.optional(),
    launchArgsOverride: z.array(z.string().max(MAX_STRING_PARAM_LENGTH)).max(200).optional(),
    skipReadinessCheck: z.boolean().optional(),
    openNativeConsole: z.boolean().optional(),
  })
  .strict();

export const cloneWithParamsSchema = z
  .object({
    name: nonEmptyStringSchema("Name", 64),
    sessionName: nonEmptyStringSchema("Session name", 96),
    gamePort: portSchema,
    queryPort: portSchema,
    rconPort: portSchema,
    installDir: windowsAbsPathSchema,
  })
  .strict();

export const backupCleanupOptionsSchema = z
  .object({
    serverIds: z.array(serverIdSchema).max(500).nullable(),
    includeFailed: z.boolean(),
    enforceRetention: z.boolean(),
    olderThanDays: z.number().int().positive().max(3650).nullable(),
    keepLastPerKind: z.number().int().positive().max(10_000).nullable(),
    protectNewestWorld: z.boolean(),
    confirmedBackupIds: z
      .array(nonEmptyStringSchema("Backup id", MAX_BACKUP_ID_LENGTH))
      .max(MAX_BACKUP_IDS_PER_REQUEST)
      .nullable()
      .optional(),
  })
  .strict();

export const backupPolicyWriteSchema = z
  .object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(5).max(10_080),
    retainCountWorld: z.number().int().min(1).max(500),
    retainCountPlayers: z.number().int().min(1).max(500),
    retainCountIni: z.number().int().min(1).max(500),
    backupDir: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim().length === 0 ? null : value,
      z.union([windowsAbsPathSchema, z.null()]),
    ),
  })
  .strict();

export const restoreBackupOptionsSchema = z
  .object({
    restoreProfilesTribes: z.boolean().optional(),
  })
  .strict();

export const backupDiskAlertSettingsSchema = z
  .object({
    warnUsedPercent: z.number().int().min(50).max(99),
    criticalUsedPercent: z.number().int().min(51).max(100),
    warnFreeBytes: z
      .number()
      .int()
      .min(1024 ** 3)
      .max(1024 * 1024 ** 3),
  })
  .strict()
  .refine((settings) => settings.criticalUsedPercent >= settings.warnUsedPercent + 1, {
    message: "Critical used percent must be greater than warn used percent",
    path: ["criticalUsedPercent"],
  });

export const serverIniPayloadSchema = z
  .object({
    gameUserSettings: z.string().max(MAX_INI_FILE_CHARS),
    game: z.string().max(MAX_INI_FILE_CHARS),
  })
  .strict();

export const clusterIniFileSelectionSchema = z
  .object({
    gameUserSettings: z.boolean(),
    game: z.boolean(),
  })
  .strict()
  .refine((files) => files.gameUserSettings || files.game, {
    message: "Select at least one INI file (Game.ini or GameUserSettings.ini)",
  });

export const logRetentionSettingsSchema = z
  .object({
    eventsRetainDays: z.number().int().min(MIN_LOG_RETENTION_DAYS).max(MAX_LOG_RETENTION_DAYS),
    eventsFailureRetainDays: z.number().int().min(MIN_LOG_RETENTION_DAYS).max(MAX_LOG_RETENTION_DAYS),
    updateLogsRetainCount: z.number().int().min(1).max(200),
    updateLogsFailureRetainDays: z.number().int().min(MIN_LOG_RETENTION_DAYS).max(MAX_LOG_RETENTION_DAYS),
    autoCleanupEnabled: z.boolean(),
  })
  .strict()
  .refine(
    (settings) => settings.eventsFailureRetainDays >= settings.eventsRetainDays,
    {
      message: "Failure event retention must be >= routine event retention",
      path: ["eventsFailureRetainDays"],
    },
  );

export const logCleanupOptionsSchema = z
  .object({
    serverIds: z.array(serverIdSchema).max(500).nullable().optional(),
    categories: z
      .array(z.enum(["events", "updateLogs"]))
      .max(8)
      .nullable()
      .optional(),
    confirmedTargets: z
      .array(
        z
          .object({
            category: z.enum(["events", "updateLogs"]),
            serverId: z.string().max(MAX_SERVER_ID_LENGTH),
            targetKey: nonEmptyStringSchema("Target key", MAX_BACKUP_ID_LENGTH),
          })
          .strict(),
      )
      .max(5_000)
      .nullable()
      .optional(),
  })
  .strict();

export const modsSearchOptionsSchema = z
  .object({
    index: z.number().int().nonnegative().max(10_000).optional(),
    pageSize: z.number().int().positive().max(50).optional(),
  })
  .strict()
  .refine((options) => (options.index ?? 0) + (options.pageSize ?? 50) <= 10_000, {
    message: "index + pageSize must be <= 10000",
  });

export function formatZodError(error: z.ZodError): string {
  const first = error.errors[0];
  if (first === undefined) {
    return "Invalid IPC arguments";
  }
  const path = first.path.length > 0 ? first.path.join(".") : "args";
  return `Invalid IPC arguments (${path}): ${first.message}`;
}
