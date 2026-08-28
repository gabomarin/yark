import type { PortConflict, ServerProfile } from "./types";

/** Fields required to detect profile-vs-profile port collisions. */
export type PortConflictProfile = Pick<
  ServerProfile,
  "id" | "name" | "gamePort" | "queryPort" | "rconPort"
>;

type Entry = {
  id: string;
  name: string;
  ports: Array<{ port: number; kind: PortConflict["kind"] }>;
};

/**
 * Detects port conflicts between profiles (all vs all).
 * `candidate` allows evaluating a draft without persisting it.
 */
export function findPortConflicts(
  profiles: ReadonlyArray<PortConflictProfile>,
  candidate?: {
    id?: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    name: string;
  },
): PortConflict[] {
  const conflicts: PortConflict[] = [];
  const seen = new Set<string>();
  const entries: Entry[] = profiles.map((p) => ({
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
        { port: candidate.gamePort, kind: "game" as const },
        { port: candidate.queryPort, kind: "query" as const },
        { port: candidate.rconPort, kind: "rcon" as const },
      ],
    });
  }

  const byPort = new Map<number, Array<{ id: string; name: string; kind: PortConflict["kind"] }>>();
  for (const entry of entries) {
    for (const portInfo of entry.ports) {
      const bucket = byPort.get(portInfo.port) ?? [];
      bucket.push({ id: entry.id, name: entry.name, kind: portInfo.kind });
      byPort.set(portInfo.port, bucket);
    }
  }

  for (const [port, bucket] of byPort) {
    if (bucket.length < 2) {
      continue;
    }

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]!;
        const b = bucket[j]!;
        // Never compare a profile against itself.
        if (a.id === b.id) {
          continue;
        }

        const keyIds = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const keyNames = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
        const key = `${port}|${a.kind}|${keyIds}|${keyNames}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        conflicts.push({
          serverA: a.name,
          serverB: b.name,
          port,
          kind: a.kind,
        });
      }
    }
  }

  return conflicts;
}
