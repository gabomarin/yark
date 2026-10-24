import type { ReactElement } from "react";
import { Button, Group, Stack, Switch, Text } from "@mantine/core";
import { Trash } from "@phosphor-icons/react";
import { openDangerConfirmModal, dangerConfirmBody } from "@ui/DangerConfirmModal/openDangerConfirmModal";
import {
  lookupSupplyCrate,
  supplyCrateFit,
  supplyCrateFitHint,
  supplyCrateRemovable,
} from "@shared/asa/asa-supply-crate-catalog";
import {
  blankSupplyCrateEntry,
  supplyCrateBodyIssue,
  supplyCrateCountIssue,
  supplyCrateMissingItemIssue,
  type SupplyCrateBody,
  type SupplyCrateItemSet,
} from "@shared/ini/supply-crate-entries";
import classes from "./ConfigurationEditor.module.css";
import { LootCountRange } from "./LootCountRange";
import { LootFitBadge } from "./LootFitBadge";
import { LootSetCard } from "./LootSetCard";

interface Props {
  body: SupplyCrateBody;
  map: string;
  disabled?: boolean;
  onChange: (body: SupplyCrateBody) => void;
  onDelete: () => void;
}

function updateSet(body: SupplyCrateBody, index: number, set: SupplyCrateItemSet): SupplyCrateBody {
  return { ...body, sets: body.sets.map((item, itemIndex) => (itemIndex === index ? set : item)) };
}

function blankSet(): SupplyCrateItemSet {
  return {
    name: "",
    minItems: "1",
    maxItems: "1",
    numItemsPower: null,
    weight: "1",
    itemsWithoutReplacement: true,
    entries: [],
  };
}

export function LootCrateDetail(props: Props): ReactElement {
  const issue = supplyCrateBodyIssue(props.body);
  const setsError = supplyCrateCountIssue(props.body.minSets, props.body.maxSets, "Set count") ?? undefined;
  const banner =
    issue !== null && issue !== "Enter a quantity." && issue !== supplyCrateMissingItemIssue([]) ? issue : null;
  const label = lookupSupplyCrate(props.body.className)?.label ?? props.body.className;
  const fit = supplyCrateFit(props.body.className, props.map);
  const hint = supplyCrateFitHint(props.body.className, props.map);
  const change = (body: SupplyCrateBody): void => props.onChange(body);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={600}>{label}</Text>
            <LootFitBadge fit={fit} hint={hint} />
          </Group>
          <Text size="xs" c="dimmed">
            {props.body.className}
          </Text>
          {supplyCrateRemovable(fit) ? (
            <Text size="xs" c="var(--app-color-attention)">
              {hint}
            </Text>
          ) : null}
        </Stack>
        <Button
          size="xs"
          color="red"
          variant="subtle"
          leftSection={<Trash size={14} />}
          disabled={props.disabled}
          onClick={() =>
            openDangerConfirmModal({
              title: "Remove this crate override?",
              confirmLabel: "Remove override",
              children: dangerConfirmBody("The crate in the game stays. It will use the game's own loot."),
              onConfirm: props.onDelete,
            })
          }
        >
          Remove override
        </Button>
      </Group>
      {banner !== null ? (
        <Text size="xs" className={classes.engramFieldHint}>
          {banner}
        </Text>
      ) : null}
      <LootCountRange
        label="Sets"
        min={props.body.minSets}
        max={props.body.maxSets}
        error={setsError}
        disabled={props.disabled}
        onMin={(value) => change({ ...props.body, minSets: value })}
        onMax={(value) => change({ ...props.body, maxSets: value })}
      />
      <Switch
        label="Do not repeat a set"
        checked={props.body.setsWithoutReplacement === true}
        disabled={props.disabled}
        onChange={(event) => change({ ...props.body, setsWithoutReplacement: event.currentTarget.checked })}
      />
      <Switch
        label="Add these sets to the game's crate"
        description="Turn this on to keep the crate's own loot. A roll then leaves out the game's items."
        checked={props.body.append === true}
        disabled={props.disabled}
        onChange={(event) => change({ ...props.body, append: event.currentTarget.checked })}
      />
      <Text size="xs" c="dimmed">
        A weight is a share of the other weights in that list. It is not a percent.
      </Text>
      {props.body.sets.map((set, setIndex) => (
        <LootSetCard
          key={setIndex}
          index={setIndex}
          set={set}
          map={props.map}
          disabled={props.disabled}
          onChange={(next) => change(updateSet(props.body, setIndex, next))}
          onRemove={() => change({ ...props.body, sets: props.body.sets.filter((_, index) => index !== setIndex) })}
        />
      ))}
      <Button
        size="compact-xs"
        variant="light"
        w="fit-content"
        disabled={props.disabled}
        onClick={() =>
          change({
            ...props.body,
            sets: [...props.body.sets, { ...blankSet(), entries: [blankSupplyCrateEntry()] }],
          })
        }
      >
        Add set
      </Button>
    </Stack>
  );
}
