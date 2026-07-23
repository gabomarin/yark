import { Card, Stack, Text, Title } from "@mantine/core";
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
    <Card withBorder className={classes.card} data-disabled={disabled || undefined}>
      <Stack gap={4}>
        <Text className={classes.label}>
          {icon}
          <span>{label}</span>
        </Text>
        <Title order={3} className={classes.value}>{value}</Title>
        {hint !== undefined && <Text className={classes.hint}>{hint}</Text>}
      </Stack>
    </Card>
  );
}