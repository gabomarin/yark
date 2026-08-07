import type { ReactElement } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import { findPortConflicts } from "@shared/port-conflicts";
import type { ServerProfile } from "@shared/types";
import { useMemo } from "react";

interface Props {
  servers: ServerProfile[];
  /** When editing, omit this profile from the fleet side of the check. */
  excludeServerId?: string;
  name: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
}

export function ServerFormPortConflictAlert(props: Props): ReactElement | null {
  const conflicts = useMemo(() => {
    const gamePort = Number(props.gamePort);
    const queryPort = Number(props.queryPort);
    const rconPort = Number(props.rconPort);
    if (
      !Number.isFinite(gamePort) ||
      !Number.isFinite(queryPort) ||
      !Number.isFinite(rconPort)
    ) {
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
    <Alert color="red" title="Port conflicts" mt="xs">
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
