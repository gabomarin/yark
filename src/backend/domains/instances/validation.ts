import { z } from "zod";
import {
  isOfficialMap,
  isValidMapSaveFolder,
  validateMapIdentity,
} from "@shared/map-identity";
import {
  getServerFolderNameError,
  getWindowsPathError,
  MAX_WINDOWS_PATH_LENGTH,
} from "@shared/server-install-path";
import { findLaunchArgConflicts } from "@shared/structured-launch-options";
import {
  PORT_MAX,
  PORT_MIN,
  type ServerProfileInput,
  type ValidationIssue,
} from "@shared/types";

export { findPortConflicts } from "@shared/port-conflicts";

/** Absolute Windows path (drive letter or UNC). */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

const portSchema = z
  .number()
  .int()
  .min(PORT_MIN, `Port must be >= ${PORT_MIN}`)
  .max(PORT_MAX, `Port must be <= ${PORT_MAX}`);

const windowsPathSchema = z
  .string()
  .min(3, "Path required")
  .max(MAX_WINDOWS_PATH_LENGTH, "Path too long")
  .regex(WINDOWS_ABS_PATH, "Must be an absolute Windows path");

export const serverProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name required")
    .max(64)
    .superRefine((value, ctx) => {
      const error = getServerFolderNameError(value);
      if (error !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    }),
  map: z.string().trim().min(1, "Map required"),
  installDir: windowsPathSchema,
  sessionName: z.string().trim().min(1, "Session name required").max(96),
  gamePort: portSchema,
  queryPort: portSchema,
  rconPort: portSchema,
  serverPassword: z.string().nullable(),
  adminPassword: z.string().min(4, "Admin password must be at least 4 characters"),
  clusterId: z.string().trim().min(1).nullable(),
  clusterDir: windowsPathSchema.nullable(),
  extraArgs: z.array(z.string()),
  structuredLaunchArgs: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean(),
        value: z.string().optional(),
      }),
    )
    .optional(),
  mods: z.array(z.string().trim().min(1)),
});

export interface ValidateProfileInputOptions {
  /**
   * New YARK profiles (`servers:create`) must use an official `KNOWN_MAPS`
   * token. Import, clone, and edit may keep custom maps.
   */
  create?: boolean;
}

/**
 * Validates a profile input. Returns a list of issues (empty if valid).
 */
export function validateProfileInput(
  input: ServerProfileInput,
  options?: ValidateProfileInputOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = serverProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    for (const err of parsed.error.errors) {
      issues.push({ field: err.path.join(".") || "root", message: err.message });
    }
    return issues;
  }

  const { gamePort, queryPort, rconPort, clusterId, clusterDir, installDir } =
    parsed.data;

  if (options?.create === true && !isOfficialMap(parsed.data.map)) {
    issues.push({
      field: "map",
      message:
        "New servers must use an official map. Add a CurseForge map pack on Mods after create.",
    });
  }
  if (options?.create === true) {
    const mapModId = input.mapModId?.trim() ?? "";
    if (mapModId.length > 0) {
      issues.push({
        field: "mapModId",
        message: "New servers cannot link a custom map pack yet.",
      });
    }
  }

  const installDirError = getWindowsPathError(installDir, "Install directory");
  if (installDirError !== null) {
    issues.push({ field: "installDir", message: installDirError });
  }
  if (clusterDir !== null) {
    const clusterDirError = getWindowsPathError(clusterDir, "Cluster directory");
    if (clusterDirError !== null) {
      issues.push({ field: "clusterDir", message: clusterDirError });
    }
  }

  const ports = [gamePort, queryPort, rconPort];
  if (new Set(ports).size !== ports.length) {
    issues.push({
      field: "ports",
      message: "Game, query, and RCON ports must be distinct",
    });
  }
  if (clusterId !== null && clusterDir === null) {
    issues.push({
      field: "clusterDir",
      message: "A server with a cluster id requires a cluster directory",
    });
  }
  const uniqueMods = new Set(parsed.data.mods);
  if (uniqueMods.size !== parsed.data.mods.length) {
    issues.push({ field: "mods", message: "Duplicate mods in the list" });
  }
  for (const conflict of findLaunchArgConflicts({
    structured: parsed.data.structuredLaunchArgs,
    extraArgs: parsed.data.extraArgs,
  })) {
    issues.push({
      field: conflict.field ?? "extraArgs",
      message: conflict.message,
    });
  }

  for (const mapIssue of validateMapIdentity({
    map: parsed.data.map,
    mapModId: input.mapModId,
    mods: parsed.data.mods,
    disabledMods: input.disabledMods,
  })) {
    // Warnings (disabled/missing map mod) surface in Launch/start (#194).
    if (mapIssue.severity === "error") {
      issues.push({ field: mapIssue.field, message: mapIssue.message });
    }
  }

  if (!isValidMapSaveFolder(input.mapSaveFolder)) {
    issues.push({
      field: "mapSaveFolder",
      message:
        "World save folder must be a single folder name under SavedArks (no path separators)",
    });
  }

  return issues;
}
