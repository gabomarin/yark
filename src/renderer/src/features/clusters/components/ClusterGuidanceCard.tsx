import type { ReactElement } from "react";
import { Accordion, Text } from "@mantine/core";
import classes from "../clusters.module.css";

interface Props {
  /** Open on first-run / empty fleet so the operator sees the rule once. */
  defaultOpen?: boolean;
}

export function ClusterGuidanceCard({ defaultOpen = false }: Props): ReactElement {
  return (
    <Accordion
      variant="contained"
      radius={0}
      chevronPosition="left"
      defaultValue={defaultOpen ? "how" : null}
      className={classes.guidanceCard}
    >
      <Accordion.Item value="how">
        <Accordion.Control>How transfers work</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm" c="dimmed">
            Servers with the same <Text span fw={600}>Cluster ID</Text> must share one{" "}
            <Text span fw={600}>cluster directory</Text> so ARK can move creatures and items
            between maps. Set both on each server (form or workspace checklist) — a directory
            alone is not enough. This page checks that Cluster ID and shared folder match. It
            does not watch live transfers in-game yet.
          </Text>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
