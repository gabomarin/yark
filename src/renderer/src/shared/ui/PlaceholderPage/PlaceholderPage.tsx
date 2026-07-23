import { Card, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import classes from "./PlaceholderPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

export function PlaceholderPage({ title, subtitle }: Props): JSX.Element {
  return (
    <PageScaffold title={title} subtitle={subtitle}>
      <Card withBorder className={classes.card}>
        <Stack gap="xs">
          <Title order={3}>Migración en progreso</Title>
          <Text c="dimmed">
            Esta pantalla todavía no fue reimplementada en el nuevo frontend. Su layout ya usa
            el shell compartido y se completará cuando llegue su diseño dedicado.
          </Text>
        </Stack>
      </Card>
    </PageScaffold>
  );
}