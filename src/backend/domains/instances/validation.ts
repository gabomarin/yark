import { z } from "zod";
import {
  getServerFolderNameError,
  getWindowsPathError,
} from "@shared/server-install-path";
import {
  PORT_MAX,
  PORT_MIN,
  type ServerProfileInput,
  type ValidationIssue,
} from "@shared/types";

export { findPortConflicts } from "@shared/port-conflicts";

/** Ruta absoluta de Windows (unidad o UNC). */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

const portSchema = z
  .number()
  .int()
  .min(PORT_MIN, `El puerto debe ser >= ${PORT_MIN}`)
  .max(PORT_MAX, `El puerto debe ser <= ${PORT_MAX}`);

const windowsPathSchema = z
  .string()
  .min(3, "Ruta requerida")
  .regex(WINDOWS_ABS_PATH, "Debe ser una ruta absoluta de Windows");

export const serverProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nombre requerido")
    .max(64)
    .superRefine((value, ctx) => {
      const error = getServerFolderNameError(value);
      if (error !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    }),
  map: z.string().trim().min(1, "Mapa requerido"),
  installDir: windowsPathSchema,
  sessionName: z.string().trim().min(1, "Nombre de sesión requerido").max(96),
  gamePort: portSchema,
  queryPort: portSchema,
  rconPort: portSchema,
  serverPassword: z.string().nullable(),
  adminPassword: z.string().min(4, "Password admin de al menos 4 caracteres"),
  clusterId: z.string().trim().min(1).nullable(),
  clusterDir: windowsPathSchema.nullable(),
  extraArgs: z.array(z.string()),
  mods: z.array(z.string().trim().min(1)),
});

/**
 * Valida un perfil de entrada. Devuelve lista de problemas (vacía si es válido).
 */
export function validateProfileInput(
  input: ServerProfileInput,
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

  const installDirError = getWindowsPathError(installDir, "Directorio de instalación");
  if (installDirError !== null) {
    issues.push({ field: "installDir", message: installDirError });
  }
  if (clusterDir !== null) {
    const clusterDirError = getWindowsPathError(clusterDir, "Directorio de cluster");
    if (clusterDirError !== null) {
      issues.push({ field: "clusterDir", message: clusterDirError });
    }
  }

  const ports = [gamePort, queryPort, rconPort];
  if (new Set(ports).size !== ports.length) {
    issues.push({
      field: "ports",
      message: "Los puertos game, query y RCON deben ser distintos entre sí",
    });
  }
  if (clusterId !== null && clusterDir === null) {
    issues.push({
      field: "clusterDir",
      message: "Un servidor con cluster id requiere directorio de cluster",
    });
  }
  const uniqueMods = new Set(parsed.data.mods);
  if (uniqueMods.size !== parsed.data.mods.length) {
    issues.push({ field: "mods", message: "Hay mods duplicados en la lista" });
  }
  return issues;
}
