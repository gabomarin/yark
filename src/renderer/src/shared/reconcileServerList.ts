import type { ServerProfile } from "@shared/types";

/**
 * Reuse prior `ServerProfile` object identities when `id` + `updatedAt` match.
 * App polls `listServers` every few seconds; new IPC arrays would otherwise
 * cascade into workspace panels (Mods sync effects, form remounts, open menus).
 */
export function reconcileServerList(
  previous: ServerProfile[],
  next: ServerProfile[],
): ServerProfile[] {
  if (
    previous.length === next.length
    && previous.every((server, index) => {
      const candidate = next[index];
      return (
        candidate !== undefined
        && server.id === candidate.id
        && server.updatedAt === candidate.updatedAt
      );
    })
  ) {
    return previous;
  }

  const previousById = new Map(previous.map((server) => [server.id, server]));
  return next.map((server) => {
    const prior = previousById.get(server.id);
    return prior !== undefined && prior.updatedAt === server.updatedAt
      ? prior
      : server;
  });
}
