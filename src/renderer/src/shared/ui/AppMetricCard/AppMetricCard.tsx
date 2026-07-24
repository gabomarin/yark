import { Card, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AppMetricCard.module.css";

interface Props {
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  disabled?: boolean;
}

export function AppMetricCard({ icon, label, value, hint, disabled = false }: Props): JSX.Element {
  return (
    <Card withBorder className={classes.card} padding="sm" data-disabled={disabled || undefined}>
      <Stack gap={2}>
        <Text
          className={classes.label}
          fz="xs"
          c="dimmed"
          fw={700}
          tt="uppercase"
          lts={0.04}
        >
          {icon}
          <span>{label}</span>
        </Text>
        <Text className={classes.value} fz="lg" fw={650} lh={1.15}>
          {value}
        </Text>
        {hint !== undefined && (
          <Text fz="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
