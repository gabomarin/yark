import { Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import classes from "../clusters.module.css";

interface Props {
  server: ServerProfile;
  subtitle: string;
  trailing?: string;
  onOpen: (serverId: string) => void;
}

export function ClusterMemberRow(props: Props): JSX.Element {
  return (
    <button
      type="button"
      className={classes.memberRow}
      onClick={() => props.onOpen(props.server.id)}
    >
      <div className={classes.memberCopy}>
        <Text fw={600} size="sm">
          {props.server.name}
        </Text>
        <Text size="xs" c="dimmed">
          {props.subtitle}
        </Text>
      </div>
      {props.trailing !== undefined && (
        <Text size="xs" c="dimmed">
          {props.trailing}
        </Text>
      )}
    </button>
  );
}
