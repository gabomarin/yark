import type { ReactElement } from "react";
import { Badge, Group, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";

interface Props {
  server: ServerProfile;
  subtitle: string;
  trailing?: string;
  onOpen: (serverId: string) => void;
}

export function ClusterMemberRow(props: Props): ReactElement {
  return (
    <SelectableListRow
      onClick={() => props.onOpen(props.server.id)}
      trailing={
        props.trailing !== undefined ? (
          <Text size="xs" c="dimmed">
            {props.trailing}
          </Text>
        ) : undefined
      }
    >
      <Group gap="xs">
        <Text fw={600} size="sm">
          {props.server.name}
        </Text>
        {props.server.enabled === false && (
          <Badge size="xs" color="gray" variant="light">
            Inactive
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        {props.subtitle}
      </Text>
    </SelectableListRow>
  );
}
