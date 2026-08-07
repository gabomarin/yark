import type { ReactElement, ReactNode } from "react";
import { Card, Stack, Text, Title } from "@mantine/core";
import classes from "./ServerForm.module.css";

interface Props {
  title: string;
  children: ReactNode;
  flat?: boolean;
  span2?: boolean;
}

export function ServerFormSection({
  title,
  children,
  flat = false,
  span2 = false,
}: Props): ReactElement {
  if (flat) {
    return (
      <Stack gap="xs" className={span2 ? classes.span2 : undefined}>
        <Text fw={600} fz="sm">
          {title}
        </Text>
        {children}
      </Stack>
    );
  }

  return (
    <Card withBorder className={classes.section}>
      <Stack gap="sm">
        <Title order={4}>{title}</Title>
        {children}
      </Stack>
    </Card>
  );
}
