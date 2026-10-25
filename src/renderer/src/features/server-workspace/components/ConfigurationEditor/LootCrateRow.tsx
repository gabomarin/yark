import type { ReactElement } from "react";
import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { type SupplyCrateCatalogEntry, type SupplyCrateFit } from "@shared/asa/asa-supply-crate-catalog";
import { LootFitBadge } from "./LootFitBadge";
import classes from "./ConfigurationEditor.module.css";

const BEACON_COLORS = ["white", "green", "blue", "purple", "yellow", "red"] as const;

interface Props {
  selected: boolean;
  label: string;
  crateClass: string;
  kind: SupplyCrateCatalogEntry["kind"] | null;
  removed: boolean;
  fit: SupplyCrateFit;
  hint: string;
  status: string | null;
  rowKey: string;
  onClick: () => void;
}

function beaconColor(label: string): (typeof BEACON_COLORS)[number] | null {
  const lower = label.toLowerCase();
  return BEACON_COLORS.find((color) => lower.includes(color)) ?? null;
}

/** One crate in the override list. */
export function LootCrateRow(props: Props): ReactElement {
  const color = beaconColor(props.label);
  return (
    <UnstyledButton
      className={classes.lootCrateRow}
      data-selected={props.selected ? "" : undefined}
      data-loot-key={props.rowKey}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      <span
        className={classes.lootCrateSwatch}
        data-color={color ?? undefined}
        data-ring={props.kind === "ring" ? "" : undefined}
        aria-hidden="true"
      />
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Text size="sm" truncate td={props.removed ? "line-through" : undefined}>
            {props.label}
          </Text>
          <LootFitBadge fit={props.fit} hint={props.hint} />
        </Group>
        <Text size="xs" c="dimmed" truncate title={props.crateClass}>
          {props.crateClass}
        </Text>
        {props.status !== null ? (
          <Text size="xs" c="var(--app-color-attention)">
            {props.status}
          </Text>
        ) : null}
      </Stack>
    </UnstyledButton>
  );
}
