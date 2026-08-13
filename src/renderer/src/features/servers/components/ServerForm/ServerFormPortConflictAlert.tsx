import type { ReactElement } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import { findPortConflicts } from "@shared/port-conflicts";
import { PORT_MAX, PORT_MIN, type ServerProfile } from "@shared/types";
import { useMemo } from "react";

interface Props {
  servers: ServerProfile[];
  /** When editing, omit this profile from the fleet side of the check. */
  excludeServerId?: string;
  name: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  /** Stretch into reserved leftover space (create Reachability card). */
  slot?: boolean;
}

function parsePreviewPort(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const port = Number(trimmed);
  if (
    !Number.isInteger(port) ||
    port < PORT_MIN ||
    port > PORT_MAX
  ) {
    return null;
  }
  return port;
}

export function ServerFormPortConflictAlert(props: Props): ReactElement | null {
  const conflicts = useMemo(() => {
    const gamePort = parsePreviewPort(props.gamePort);
    const queryPort = parsePreviewPort(props.queryPort);
    const rconPort = parsePreviewPort(props.rconPort);
    if (gamePort === null || queryPort === null || rconPort === null) {
      return [];
    }
    const others =
      props.excludeServerId === undefined
        ? props.servers
        : props.servers.filter((server) => server.id !== props.excludeServerId);
    return findPortConflicts(others, {
      id: props.excludeServerId,
      name: props.name.trim().length > 0 ? props.name.trim() : "New server",
      gamePort,
      queryPort,
      rconPort,
    });
  }, [
    props.excludeServerId,
    props.gamePort,
    props.name,
    props.queryPort,
    props.rconPort,
    props.servers,
  ]);

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <Alert
      color="red"
      title="Port conflicts"
      mt={props.slot === true ? 0 : "xs"}
      style={props.slot === true ? { flex: 1, width: "100%" } : undefined}
    >
      <Stack gap={4}>
        {conflicts.map((conflict) => (
          <Text
            key={`${conflict.port}-${conflict.kind}-${conflict.serverA}-${conflict.serverB}`}
            size="sm"
          >
            Port {conflict.port} ({conflict.kind}) between {conflict.serverA} and{" "}
            {conflict.serverB}
          </Text>
        ))}
      </Stack>
    </Alert>
  );
}
