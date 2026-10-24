import { useState, type ReactElement } from "react";
import { Button, Collapse, Group, Paper, Stack, Switch, Text, TextInput } from "@mantine/core";
import { Trash } from "@phosphor-icons/react";
import {
  supplyCrateChanceIssue,
  supplyCrateClassWeightsFor,
  supplyCrateEntryHasIssue,
  supplyCrateQualityIssue,
  supplyCrateQuantityIssue,
  supplyCrateSavedQuantityIssue,
  supplyCrateWeightIssue,
  type SupplyCrateItemEntry,
} from "@shared/ini/supply-crate-entries";
import { LootItemClasses } from "./LootItemClasses";

interface Props {
  entry: SupplyCrateItemEntry;
  map: string;
  soleItem: boolean;
  disabled?: boolean;
  onChange: (entry: SupplyCrateItemEntry) => void;
  onRemove: () => void;
}

function hasAdvanced(entry: SupplyCrateItemEntry): boolean {
  if (entry.minQuality.trim().length > 0 || entry.maxQuality.trim().length > 0) return true;
  if (entry.forceBlueprint === true) return true;
  const chance = entry.blueprintChance.trim();
  return chance.length > 0 && Number(chance) !== 0;
}

function withClasses(entry: SupplyCrateItemEntry, classes: string[]): SupplyCrateItemEntry {
  return {
    ...entry,
    classes,
    classWeights: supplyCrateClassWeightsFor(entry.classes, entry.classWeights, classes),
  };
}

/** One loot entry: the item, then its quantity. Quality and blueprint stay closed unless set. */
export function LootEntryCard(props: Props): ReactElement {
  const [more, setMore] = useState(() => hasAdvanced(props.entry));
  const filled = props.entry.classes.filter((className) => className.trim().length > 0).length;
  const hasClass = filled > 0;
  const shared = filled >= 2;
  const quantityTouched = props.entry.minQuantity.trim().length > 0 || props.entry.maxQuantity.trim().length > 0;
  const quantityError =
    hasClass || quantityTouched
      ? (supplyCrateQuantityIssue(props.entry.minQuantity, props.entry.maxQuantity) ?? undefined)
      : undefined;
  const savedQuantity = supplyCrateSavedQuantityIssue(props.entry);
  const minQuantityError = savedQuantity.min ?? (quantityError !== undefined ? true : undefined);
  const maxQuantityError = savedQuantity.max ?? quantityError;
  const itemWeightError =
    !shared && !props.soleItem && hasClass
      ? (supplyCrateWeightIssue(props.entry.weight, "Item weight", true) ?? undefined)
      : undefined;
  const classWeightIssues = props.entry.classes.map((className, index) =>
    shared && className.trim().length > 0
      ? supplyCrateWeightIssue(props.entry.classWeights[index] ?? "1", "Class weight", true)
      : null,
  );
  const qualityError = supplyCrateQualityIssue(props.entry.minQuality, props.entry.maxQuality) ?? undefined;
  const chanceError = supplyCrateChanceIssue(props.entry.blueprintChance) ?? undefined;
  const change = (entry: SupplyCrateItemEntry): void => props.onChange(entry);

  return (
    <Paper
      withBorder
      p="xs"
      radius="sm"
      style={supplyCrateEntryHasIssue(props.entry) ? { borderColor: "var(--app-color-danger-bright)" } : undefined}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Item
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            leftSection={<Trash size={14} />}
            disabled={props.disabled}
            onClick={props.onRemove}
          >
            Remove entry
          </Button>
        </Group>
        <LootItemClasses
          classes={props.entry.classes}
          weights={props.entry.classWeights}
          weightIssues={classWeightIssues}
          map={props.map}
          disabled={props.disabled}
          onChange={(classes) => change(withClasses(props.entry, classes))}
          onWeight={(index, weight) => {
            const classWeights = props.entry.classes.map((_, itemIndex) => props.entry.classWeights[itemIndex] ?? "1");
            classWeights[index] = weight;
            change({ ...props.entry, classWeights });
          }}
        />
        {shared ? (
          <Text size="xs" c="dimmed">
            These items share the quantity. Each unit is one of them.
          </Text>
        ) : null}
        {!shared && props.soleItem ? (
          <Text size="xs" c="dimmed">
            Only item in this set.
          </Text>
        ) : null}
        <Group grow align="flex-start" wrap="nowrap">
          {shared || props.soleItem ? null : (
            <TextInput
              label="Item weight"
              size="xs"
              value={props.entry.weight}
              disabled={props.disabled}
              error={itemWeightError}
              onChange={(event) => change({ ...props.entry, weight: event.currentTarget.value })}
            />
          )}
          <TextInput
            label="Minimum quantity"
            size="xs"
            value={props.entry.minQuantity}
            disabled={props.disabled}
            error={minQuantityError}
            onChange={(event) => change({ ...props.entry, minQuantity: event.currentTarget.value })}
          />
          <TextInput
            label="Maximum quantity"
            size="xs"
            value={props.entry.maxQuantity}
            disabled={props.disabled}
            error={maxQuantityError}
            onChange={(event) => change({ ...props.entry, maxQuantity: event.currentTarget.value })}
          />
        </Group>
        <Button size="compact-xs" variant="subtle" w="fit-content" onClick={() => setMore((open) => !open)}>
          {more ? "Hide quality and blueprint" : "Quality and blueprint"}
        </Button>
        <Collapse expanded={more}>
          <Stack gap="xs">
            <Group grow align="flex-start">
              <TextInput
                label="Minimum quality"
                size="xs"
                value={props.entry.minQuality}
                disabled={props.disabled}
                error={qualityError !== undefined}
                onChange={(event) => change({ ...props.entry, minQuality: event.currentTarget.value })}
              />
              <TextInput
                label="Maximum quality"
                size="xs"
                value={props.entry.maxQuality}
                disabled={props.disabled}
                error={qualityError}
                onChange={(event) => change({ ...props.entry, maxQuality: event.currentTarget.value })}
              />
              <TextInput
                label="Blueprint chance"
                description="0 to 1"
                inputWrapperOrder={["label", "input", "description", "error"]}
                size="xs"
                value={props.entry.blueprintChance}
                disabled={props.disabled}
                error={chanceError}
                onChange={(event) => change({ ...props.entry, blueprintChance: event.currentTarget.value })}
              />
            </Group>
            <Switch
              label="Always a blueprint"
              checked={props.entry.forceBlueprint === true}
              disabled={props.disabled}
              onChange={(event) => change({ ...props.entry, forceBlueprint: event.currentTarget.checked })}
            />
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
