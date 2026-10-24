import type { ReactElement } from "react";
import { Group, Stack, Text, TextInput } from "@mantine/core";

interface Props {
  label: string;
  min: string;
  max: string;
  error?: string;
  disabled?: boolean;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}

/** One min-to-max pair, so set count and item count are not eight loose boxes. */
export function LootCountRange(props: Props): ReactElement {
  return (
    <Stack gap={4} w="fit-content">
      <Text size="xs" fw={500}>
        {props.label}
      </Text>
      <Group gap="xs" wrap="nowrap" align="center">
        <TextInput
          aria-label={`Minimum ${props.label}`}
          size="xs"
          w={72}
          value={props.min}
          disabled={props.disabled}
          error={props.error !== undefined}
          onChange={(event) => props.onMin(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          to
        </Text>
        <TextInput
          aria-label={`Maximum ${props.label}`}
          size="xs"
          w={72}
          value={props.max}
          disabled={props.disabled}
          error={props.error !== undefined}
          onChange={(event) => props.onMax(event.currentTarget.value)}
        />
      </Group>
      {props.error !== undefined ? (
        <Text size="xs" c="var(--app-color-danger-bright)">
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
