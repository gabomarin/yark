import type { ReactElement } from "react";
import { Button, Group, Paper, Stack, Switch, Text, TextInput } from "@mantine/core";
import { Trash } from "@phosphor-icons/react";
import {
  blankSupplyCrateEntry,
  supplyCrateCountIssue,
  supplyCrateSetHasIssue,
  supplyCrateSetIncludesEveryEntry,
  supplyCrateWeightIssue,
  type SupplyCrateItemEntry,
  type SupplyCrateItemSet,
} from "@shared/ini/supply-crate-entries";
import { LootCountRange } from "./LootCountRange";
import { LootEntryCard } from "./LootEntryCard";

interface Props {
  index: number;
  set: SupplyCrateItemSet;
  map: string;
  disabled?: boolean;
  onChange: (set: SupplyCrateItemSet) => void;
  onRemove: () => void;
}

function replaceEntry(set: SupplyCrateItemSet, index: number, entry: SupplyCrateItemEntry): SupplyCrateItemSet {
  return { ...set, entries: set.entries.map((item, itemIndex) => (itemIndex === index ? entry : item)) };
}

function countLabel(value: string): string | null {
  const numeric = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(numeric)) return null;
  return Number.isInteger(numeric) ? String(numeric) : value.trim();
}

function givesLine(min: string, max: string): string | null {
  const low = countLabel(min);
  const high = countLabel(max);
  if (low === null || high === null) return null;
  if (low === high) return `This set gives ${low} of these entries.`;
  return `This set gives ${low} to ${high} of these entries.`;
}

/** One item set inside a crate override. */
export function LootSetCard(props: Props): ReactElement {
  const change = (set: SupplyCrateItemSet): void => props.onChange(set);
  const soleWeight = props.set.entries[0]?.weight ?? "";
  const soleItem = props.set.entries.length === 1 && soleWeight.trim().length > 0 && Number(soleWeight) === 1;
  const gives = givesLine(props.set.minItems, props.set.maxItems);
  const weightError = supplyCrateWeightIssue(props.set.weight, "Set weight", false) ?? undefined;
  const itemsError = supplyCrateCountIssue(props.set.minItems, props.set.maxItems, "Item count") ?? undefined;

  return (
    <Paper
      withBorder
      p="sm"
      radius="sm"
      style={supplyCrateSetHasIssue(props.set) ? { borderColor: "var(--app-color-danger-bright)" } : undefined}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Set {props.index + 1}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            leftSection={<Trash size={14} />}
            disabled={props.disabled}
            onClick={props.onRemove}
          >
            Remove set
          </Button>
        </Group>
        {props.set.name.trim().length > 0 ? (
          <TextInput
            label="Name"
            size="xs"
            value={props.set.name}
            disabled={props.disabled}
            onChange={(event) => change({ ...props.set, name: event.currentTarget.value })}
          />
        ) : null}
        <Group align="flex-start" wrap="nowrap">
          <TextInput
            label="Set weight"
            size="xs"
            w={100}
            value={props.set.weight}
            disabled={props.disabled}
            error={weightError !== undefined}
            onChange={(event) => change({ ...props.set, weight: event.currentTarget.value })}
          />
          <LootCountRange
            label="Items"
            min={props.set.minItems}
            max={props.set.maxItems}
            error={itemsError}
            disabled={props.disabled}
            onMin={(value) => change({ ...props.set, minItems: value })}
            onMax={(value) => change({ ...props.set, maxItems: value })}
          />
        </Group>
        {weightError !== undefined ? (
          <Text size="xs" c="var(--app-color-danger-bright)">
            {weightError}
          </Text>
        ) : null}
        {gives !== null ? (
          <Text size="xs" c="dimmed">
            {gives}
          </Text>
        ) : null}
        <Switch
          label="Do not repeat an item in this set"
          checked={props.set.itemsWithoutReplacement === true}
          disabled={props.disabled}
          onChange={(event) => change({ ...props.set, itemsWithoutReplacement: event.currentTarget.checked })}
        />
        {supplyCrateSetIncludesEveryEntry(props.set) ? (
          <Text size="xs" c="dimmed">
            This set includes every entry.
          </Text>
        ) : null}
        {props.set.entries.map((entry, entryIndex) => (
          <LootEntryCard
            key={entryIndex}
            entry={entry}
            map={props.map}
            soleItem={soleItem}
            disabled={props.disabled}
            onChange={(next) => change(replaceEntry(props.set, entryIndex, next))}
            onRemove={() =>
              change({ ...props.set, entries: props.set.entries.filter((_, index) => index !== entryIndex) })
            }
          />
        ))}
        <Button
          size="compact-xs"
          variant="light"
          w="fit-content"
          disabled={props.disabled}
          onClick={() => change({ ...props.set, entries: [...props.set.entries, blankSupplyCrateEntry()] })}
        >
          Add entry
        </Button>
      </Stack>
    </Paper>
  );
}
