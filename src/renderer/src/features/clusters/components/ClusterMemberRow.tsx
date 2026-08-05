import type { ReactElement } from "react";
import { Badge, Button, Group, Text } from "@mantine/core";
import type { ServerProfile, ServerStatus } from "@shared/types";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import classes from "../clusters.module.css";

interface Props {
  server: ServerProfile;
  subtitle: string;
  status?: ServerStatus;
  canRemove?: boolean;
  removeReason?: string | null;
  onOpen: (serverId: string) => void;
  onRemove?: (serverId: string) => void;
}

export function ClusterMemberRow(props: Props): ReactElement {
  const showRemove = props.onRemove !== undefined;

  return (
    <div className={classes.memberRow}>
      <div className={classes.memberBody}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {props.server.name}
          </Text>
          {!props.server.enabled && (
            <Badge size="xs" color="gray" variant="light">
              Inactive
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {props.subtitle}
        </Text>
        {showRemove && props.canRemove === false && props.removeReason != null && (
          <Text size="xs" c="orange">
            {props.removeReason}
          </Text>
        )}
      </div>
      <Group gap="xs" wrap="nowrap" className={classes.memberActions}>
        {props.status !== undefined && (
          <ServerRuntimeStatusBadge status={props.status} size="xs" />
        )}
        <Button
          size="compact-xs"
          variant="default"
          aria-label={`Open ${props.server.name}`}
          onClick={() => props.onOpen(props.server.id)}
        >
          Open
        </Button>
        {showRemove && (
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            aria-label={`Remove ${props.server.name}`}
            disabled={props.canRemove === false}
            onClick={() => props.onRemove?.(props.server.id)}
          >
            Remove
          </Button>
        )}
      </Group>
    </div>
  );
}
