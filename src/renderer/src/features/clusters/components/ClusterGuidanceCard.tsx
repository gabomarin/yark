import { ArrowsLeftRight } from "@phosphor-icons/react";
import { Card, Group, Stack, Text, Title } from "@mantine/core";
import classes from "../clusters.module.css";

export function ClusterGuidanceCard(): JSX.Element {
  return (
    <Card withBorder className={classes.guidanceCard}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <div className={classes.guidanceIcon}>
          <ArrowsLeftRight size={20} />
        </div>
        <Stack gap={4} className={classes.guidanceCopy}>
          <Title order={3} size="h4">
            How transfers work here
          </Title>
          <Text size="sm" c="dimmed">
            Members of the same <Text span fw={600}>Cluster ID</Text> must share one{" "}
            <Text span fw={600}>cluster directory</Text> so ARK can move creatures and items
            between maps. Both fields are required: a directory alone does not register a
            cluster here. Assign them on each server (form or workspace checklist). This page
            surfaces the compliance checks the backend already runs — it does not validate live
            transfers yet.
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}
