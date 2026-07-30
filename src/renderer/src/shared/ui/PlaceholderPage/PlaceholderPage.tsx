import type { ReactElement } from "react";
import { Card, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import classes from "./PlaceholderPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

export function PlaceholderPage({ title, subtitle }: Props): ReactElement {
  return (
    <PageScaffold title={title} subtitle={subtitle}>
      <Card withBorder className={classes.card}>
        <Stack gap="xs">
          <Title order={3}>Migration in progress</Title>
          <Text c="dimmed">
            This screen has not been reimplemented in the new frontend yet. Its layout already uses
            the shared shell and will be completed when its dedicated design arrives.
          </Text>
        </Stack>
      </Card>
    </PageScaffold>
  );
}