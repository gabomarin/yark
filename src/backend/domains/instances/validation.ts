import { z } from "zod";
import {
  PORT_MAX,
  PORT_MIN,
  type PortConflict,
  type ServerProfile,
  type ServerProfileInput,
  type ValidationIssue,
} from "@shared/types";

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
  name: z.string().trim().min(1, "Nombre requerido").max(64),
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
      issues.push({ field: err.path.join("."), message: err.message });
    }
    return issues;
  }

  const { gamePort, queryPort, rconPort, clusterId, clusterDir } = parsed.data;
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

/**
 * Detecta conflictos de puertos entre perfiles (todos contra todos).
 * `exclude` permite omitir un id (p. ej. el perfil en edición).
 */
export function findPortConflicts(
  profiles: ServerProfile[],
  candidate?: { id?: string; gamePort: number; queryPort: number; rconPort: number; name: string },
): PortConflict[] {
  const conflicts: PortConflict[] = [];
  const entries = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    ports: [
      { port: p.gamePort, kind: "game" as const },
      { port: p.queryPort, kind: "query" as const },
      { port: p.rconPort, kind: "rcon" as const },
    ],
  }));

  if (candidate) {
    entries.push({
      id: candidate.id ?? "__candidate__",
      name: candidate.name,
      ports: [
        { port: candidate.gamePort, kind: "game" },
        { port: candidate.queryPort, kind: "query" },
        { port: candidate.rconPort, kind: "rcon" },
      ],
    });
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (candidate?.id !== undefined && (a.id === candidate.id || b.id === candidate.id)) {
        // Si el candidato reemplaza a un perfil existente, no compararlo consigo mismo.
        if (a.id === b.id) continue;
      }
      for (const pa of a.ports) {
        for (const pb of b.ports) {
          if (pa.port === pb.port) {
            conflicts.push({
              serverA: a.name,
              serverB: b.name,
              port: pa.port,
              kind: pa.kind,
            });
          }
        }
      }
    }
  }
  return conflicts;
}
