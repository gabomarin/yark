import type { ReactElement } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
interface Props {
  onEdit: () => void;
}

export function ClusterWideSummary(props: Props): ReactElement {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="xs">
          <Text fw={600} size="sm">
            Transfer settings
          </Text>
        </Group>
        <Button variant="default" onClick={props.onEdit}>
          Edit cluster settings
        </Button>
      </Group>
    </Stack>
  );
}
