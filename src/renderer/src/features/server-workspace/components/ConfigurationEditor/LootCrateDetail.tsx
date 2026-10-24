import type { ReactElement } from "react";
import { Button, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import { openDangerConfirmModal, dangerConfirmBody } from "@ui/DangerConfirmModal/openDangerConfirmModal";
import {
  blankSupplyCrateEntry,
  supplyCrateBodyIssue,
  type SupplyCrateBody,
  type SupplyCrateItemEntry,
  type SupplyCrateItemSet,
} from "@shared/ini/supply-crate-entries";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  body: SupplyCrateBody;
  disabled?: boolean;
  onChange: (body: SupplyCrateBody) => void;
  onDelete: () => void;
}

function updateSet(body: SupplyCrateBody, index: number, set: SupplyCrateItemSet): SupplyCrateBody {
  return { ...body, sets: body.sets.map((item, itemIndex) => (itemIndex === index ? set : item)) };
}

function updateEntry(set: SupplyCrateItemSet, index: number, entry: SupplyCrateItemEntry): SupplyCrateItemSet {
  return { ...set, entries: set.entries.map((item, itemIndex) => (itemIndex === index ? entry : item)) };
}

export function LootCrateDetail(props: Props): ReactElement {
  const issue = supplyCrateBodyIssue(props.body);
  const change = (body: SupplyCrateBody): void => props.onChange(body);

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600}>{props.body.className}</Text>
        <Button
          size="xs"
          color="red"
          variant="subtle"
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
      {issue !== null ? (
        <Text size="xs" className={classes.engramFieldHint}>
          {issue}
        </Text>
      ) : null}
      <Group grow>
        <TextInput
          label="Minimum sets"
          size="xs"
          value={props.body.minSets}
          disabled={props.disabled}
          onChange={(event) => change({ ...props.body, minSets: event.currentTarget.value })}
        />
        <TextInput
          label="Maximum sets"
          size="xs"
          value={props.body.maxSets}
          disabled={props.disabled}
          onChange={(event) => change({ ...props.body, maxSets: event.currentTarget.value })}
        />
      </Group>
      <Switch
        label="Do not repeat a set"
        checked={props.body.setsWithoutReplacement === true}
        disabled={props.disabled}
        onChange={(event) => change({ ...props.body, setsWithoutReplacement: event.currentTarget.checked })}
      />
      <Switch
        label="Add these sets to the game's crate"
        description="The simulator then rolls only this override."
        checked={props.body.append === true}
        disabled={props.disabled}
        onChange={(event) => change({ ...props.body, append: event.currentTarget.checked })}
      />
      {props.body.sets.map((set, setIndex) => (
        <Stack key={setIndex} gap="xs">
          <Text size="sm" fw={600}>
            Set {setIndex + 1}
          </Text>
          <Group grow>
            <TextInput
              label="Name"
              size="xs"
              value={set.name}
              disabled={props.disabled}
              onChange={(event) => change(updateSet(props.body, setIndex, { ...set, name: event.currentTarget.value }))}
            />
            <TextInput
              label="Weight"
              size="xs"
              value={set.weight}
              disabled={props.disabled}
              onChange={(event) =>
                change(updateSet(props.body, setIndex, { ...set, weight: event.currentTarget.value }))
              }
            />
            <TextInput
              label="Minimum items"
              size="xs"
              value={set.minItems}
              disabled={props.disabled}
              onChange={(event) =>
                change(updateSet(props.body, setIndex, { ...set, minItems: event.currentTarget.value }))
              }
            />
            <TextInput
              label="Maximum items"
              size="xs"
              value={set.maxItems}
              disabled={props.disabled}
              onChange={(event) =>
                change(updateSet(props.body, setIndex, { ...set, maxItems: event.currentTarget.value }))
              }
            />
          </Group>
          <Switch
            label="Do not repeat an item in this set"
            checked={set.itemsWithoutReplacement === true}
            disabled={props.disabled}
            onChange={(event) =>
              change(updateSet(props.body, setIndex, { ...set, itemsWithoutReplacement: event.currentTarget.checked }))
            }
          />
          {set.entries.map((entry, entryIndex) => (
            <Stack key={entryIndex} gap={4}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Entry {entryIndex + 1}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  disabled={props.disabled}
                  onClick={() =>
                    change(
                      updateSet(props.body, setIndex, {
                        ...set,
                        entries: set.entries.filter((_, index) => index !== entryIndex),
                      }),
                    )
                  }
                >
                  Remove entry
                </Button>
              </Group>
              <Group grow>
                <TextInput
                  label="Item classes"
                  description="Separate classes with commas."
                  size="xs"
                  value={entry.classes.join(", ")}
                  disabled={props.disabled}
                  onChange={(event) => {
                    const raw = event.currentTarget.value;
                    const classes = raw.split(",").map((part) => part.trim());
                    if (!/,\s*$/.test(raw) && classes[classes.length - 1] === "") classes.pop();
                    const classWeights = classes.map((_, index) => entry.classWeights[index] ?? "1");
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, classes, classWeights }),
                      ),
                    );
                  }}
                />
                <TextInput
                  label="Weight"
                  size="xs"
                  value={entry.weight}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, weight: event.currentTarget.value }),
                      ),
                    )
                  }
                />
                <TextInput
                  label="Minimum quantity"
                  size="xs"
                  value={entry.minQuantity}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, minQuantity: event.currentTarget.value }),
                      ),
                    )
                  }
                />
                <TextInput
                  label="Maximum quantity"
                  size="xs"
                  value={entry.maxQuantity}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, maxQuantity: event.currentTarget.value }),
                      ),
                    )
                  }
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Minimum quality"
                  size="xs"
                  value={entry.minQuality}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, minQuality: event.currentTarget.value }),
                      ),
                    )
                  }
                />
                <TextInput
                  label="Maximum quality"
                  size="xs"
                  value={entry.maxQuality}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, maxQuality: event.currentTarget.value }),
                      ),
                    )
                  }
                />
                <TextInput
                  label="Blueprint chance"
                  description="0 to 1"
                  size="xs"
                  value={entry.blueprintChance}
                  disabled={props.disabled}
                  onChange={(event) =>
                    change(
                      updateSet(
                        props.body,
                        setIndex,
                        updateEntry(set, entryIndex, { ...entry, blueprintChance: event.currentTarget.value }),
                      ),
                    )
                  }
                />
              </Group>
              <Switch
                label="Always a blueprint"
                checked={entry.forceBlueprint === true}
                disabled={props.disabled}
                onChange={(event) =>
                  change(
                    updateSet(
                      props.body,
                      setIndex,
                      updateEntry(set, entryIndex, { ...entry, forceBlueprint: event.currentTarget.checked }),
                    ),
                  )
                }
              />
            </Stack>
          ))}
          <Button
            size="compact-xs"
            variant="light"
            disabled={props.disabled}
            onClick={() =>
              change(updateSet(props.body, setIndex, { ...set, entries: [...set.entries, blankSupplyCrateEntry()] }))
            }
          >
            Add entry
          </Button>
        </Stack>
      ))}
      <Button
        size="compact-xs"
        variant="light"
        disabled={props.disabled}
        onClick={() =>
          change({
            ...props.body,
            sets: [
              ...props.body.sets,
              {
                name: "",
                minItems: "1",
                maxItems: "1",
                numItemsPower: null,
                weight: "1",
                itemsWithoutReplacement: true,
                entries: [blankSupplyCrateEntry()],
              },
            ],
          })
        }
      >
        Add set
      </Button>
    </Stack>
  );
}
