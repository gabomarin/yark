import { Group, Text } from "@mantine/core";
import type { ReactElement } from "react";

interface Props {
  label: string;
  value: string;
}

/** Label/value meta row for detail panels and side rails. */
export function MetaRow(props: Props): ReactElement {
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed">{props.label}</Text>
      <Text size="sm" ta="right" fw={500}>{props.value}</Text>
    </Group>
  );
}
