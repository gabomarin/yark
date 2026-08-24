import type { ServerProfile } from "@shared/types";

/** Filter overview server lists by name / map / cluster id (case-insensitive). */
export function filterOverviewServers(
  servers: ServerProfile[],
  search: string,
): ServerProfile[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return servers;
  }
  return servers.filter((server) =>
    [server.name, server.map, server.clusterId ?? ""].some((field) =>
      field.toLowerCase().includes(query),
    ),
  );
}

export function partitionOverviewServers(servers: ServerProfile[]): {
  enabled: ServerProfile[];
  disabled: ServerProfile[];
} {
  const enabled: ServerProfile[] = [];
  const disabled: ServerProfile[] = [];
  for (const server of servers) {
    if (server.enabled) {
      enabled.push(server);
    } else {
      disabled.push(server);
    }
  }
  return { enabled, disabled };
}
