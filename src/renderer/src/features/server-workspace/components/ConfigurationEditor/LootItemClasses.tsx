import { useMemo, useState, type ReactElement } from "react";
import { ActionIcon, Combobox, Stack, Text, TextInput, useCombobox } from "@mantine/core";
import { X } from "@phosphor-icons/react";
import { lookupAsaItem, asaItemEntries, type AsaItemEntry } from "@shared/asa/asa-item-catalog";
import { isSafeEngramClassName, UNSAFE_ENGRAM_CLASS_MESSAGE } from "@shared/ini/engram-named-entries";
import { supplyCrateMissingItemIssue } from "@shared/ini/supply-crate-entries";
import classes from "./ConfigurationEditor.module.css";

const RESULT_LIMIT = 20;
const CHOOSE_MATCH = "Choose a match, or enter the item class.";

interface Props {
  classes: readonly string[];
  weights?: readonly string[];
  weightIssues?: readonly (string | null)[];
  map: string;
  disabled?: boolean;
  onChange: (classes: string[]) => void;
  onWeight?: (index: number, weight: string) => void;
}

function onThisMap(entry: AsaItemEntry, map: string): boolean {
  if (map.length === 0 || entry.maps.length === 0) return true;
  return entry.maps.includes(map);
}

function matchingItems(query: string, map: string): AsaItemEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  return asaItemEntries
    .filter((entry) => entry.label.toLowerCase().includes(needle) || entry.className.toLowerCase().includes(needle))
    .sort(
      (left, right) =>
        Number(onThisMap(right, map)) - Number(onThisMap(left, map)) || left.label.localeCompare(right.label),
    )
    .slice(0, RESULT_LIMIT);
}

function resolveItemClass(query: string): { className: string } | { reason: string } | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  const byClass = lookupAsaItem(trimmed);
  if (byClass !== undefined) return { className: byClass.className };
  const labelHit = asaItemEntries.some((entry) => entry.label.toLowerCase() === trimmed.toLowerCase());
  if (labelHit || !isSafeEngramClassName(trimmed)) {
    return { reason: isSafeEngramClassName(trimmed) ? CHOOSE_MATCH : UNSAFE_ENGRAM_CLASS_MESSAGE };
  }
  return { className: trimmed };
}

/** Catalog search for one loot entry. Enter adds a class. A display name does not replace it. */
export function LootItemClasses(props: Props): ReactElement {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const options = useMemo(() => matchingItems(query, props.map), [query, props.map]);
  const trimmed = query.trim();
  const filled = props.classes.filter((className) => className.trim().length > 0).length;
  const missingItem = supplyCrateMissingItemIssue(props.classes);
  const showWeights = filled >= 2;
  const weightMessages = [
    ...new Set((props.weightIssues ?? []).filter((issue): issue is string => issue !== null && issue.length > 0)),
  ];

  const add = (next: string): void => {
    const resolved = resolveItemClass(next);
    if (resolved === null) return;
    if ("reason" in resolved) {
      setError(resolved.reason);
      return;
    }
    if (props.classes.some((className) => className.toLowerCase() === resolved.className.toLowerCase())) {
      setError("That class is already in this entry.");
      return;
    }
    props.onChange([...props.classes.filter((className) => className.length > 0), resolved.className]);
    setQuery("");
    setError("");
    combobox.closeDropdown();
  };

  return (
    <Stack gap={4}>
      {showWeights ? (
        <div className={classes.lootItemHead}>
          <span />
          <Text size="xs" c="dimmed">
            Weight
          </Text>
          <span />
        </div>
      ) : null}
      {props.classes.map((className, index) => {
        if (className.length === 0) return null;
        const known = lookupAsaItem(className);
        const label = known?.label ?? className;
        return (
          <div
            key={`${index}-${className}`}
            className={showWeights ? classes.lootItemRowWeighted : classes.lootItemRow}
          >
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" truncate>
                {label}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {known !== undefined ? className : "Not in the item list."}
              </Text>
            </Stack>
            {showWeights ? (
              <TextInput
                aria-label={`${label} weight`}
                size="xs"
                w="100%"
                miw={0}
                value={props.weights?.[index] ?? "1"}
                disabled={props.disabled}
                error={props.weightIssues?.[index] != null}
                onChange={(event) => props.onWeight?.(index, event.currentTarget.value)}
              />
            ) : null}
            <ActionIcon
              aria-label={`Remove ${label}`}
              variant="subtle"
              color="red"
              size="sm"
              disabled={props.disabled}
              onClick={() => props.onChange(props.classes.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X size={14} aria-hidden="true" />
            </ActionIcon>
          </div>
        );
      })}
      {weightMessages.map((message) => (
        <Text key={message} size="xs" c="var(--app-color-danger-bright)">
          {message}
        </Text>
      ))}
      <Combobox
        store={combobox}
        withinPortal
        position="bottom-start"
        width="target"
        onOptionSubmit={(value) => add(value)}
      >
        <Combobox.Target>
          <TextInput
            aria-label="Add an item"
            placeholder={filled > 0 ? "Add another item to this entry" : "Item name or class"}
            size="xs"
            value={query}
            disabled={props.disabled}
            error={error.length > 0 ? error : (missingItem ?? undefined)}
            onFocus={() => combobox.openDropdown()}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setError("");
              combobox.openDropdown();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || combobox.getSelectedOptionIndex() >= 0) return;
              event.preventDefault();
              add(query);
            }}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options style={{ maxHeight: 240, overflowY: "auto" }}>
            {options.map((entry) => (
              <Combobox.Option key={entry.className} value={entry.className}>
                <Text size="sm">{entry.label}</Text>
                <Text size="xs" c="dimmed">
                  {entry.className}
                </Text>
              </Combobox.Option>
            ))}
            {trimmed.length === 0 ? <Combobox.Empty>Type an item name or class.</Combobox.Empty> : null}
            {trimmed.length > 0 && options.length === 0 ? (
              <Combobox.Empty>No listed item matches. Enter accepts a class name.</Combobox.Empty>
            ) : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Stack>
  );
}
