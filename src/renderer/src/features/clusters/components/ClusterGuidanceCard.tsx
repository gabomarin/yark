import type { ReactElement } from "react";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { Group, Stack, Text, Title } from "@mantine/core";
import { AccentIconTile } from "@ui/AccentIconTile/AccentIconTile";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "../clusters.module.css";

export function ClusterGuidanceCard(): ReactElement {
  return (
    <AppSurfaceCard tone="coolEmphasis" className={classes.guidanceCard}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <AccentIconTile>
          <ArrowsLeftRight size={20} />
        </AccentIconTile>
        <Stack gap={4} className={classes.guidanceCopy}>
          <Title order={3} size="h4">
            How transfers work here
          </Title>
          <Text size="sm" c="dimmed">
            Servers with the same <Text span fw={600}>Cluster ID</Text> must share one{" "}
            <Text span fw={600}>cluster directory</Text> so ARK can move creatures and items
            between maps. Set both on each server (form or workspace checklist) — a directory
            alone is not enough. This page checks that Cluster ID and shared folder match. It
            does not watch live transfers in-game yet.
          </Text>
        </Stack>
      </Group>
    </AppSurfaceCard>
  );
}
