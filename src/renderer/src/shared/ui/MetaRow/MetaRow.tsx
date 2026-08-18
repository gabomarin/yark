import { Group, Text } from "@mantine/core";
import type { ReactElement } from "react";

interface Props {
  label: string;
  value: string;
  mono?: boolean;
}

/** Label/value meta row for detail panels and side rails. */
export function MetaRow(props: Props): ReactElement {
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed">{props.label}</Text>
      <Text
        size={props.mono ? "xs" : "sm"}
        ta="right"
        fw={500}
        ff={props.mono ? "monospace" : undefined}
      >
        {props.value}
      </Text>
    </Group>
  );
}
