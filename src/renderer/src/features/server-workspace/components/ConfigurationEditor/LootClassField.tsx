import { useMemo, type ReactElement } from "react";
import { Box, Button, Combobox, Group, Text, TextInput, useCombobox } from "@mantine/core";
import {
  lookupSupplyCrate,
  supplyCrateCatalog,
  type SupplyCrateCatalogEntry,
} from "@shared/asa/asa-supply-crate-catalog";
import { isSafeEngramClassName, UNSAFE_ENGRAM_CLASS_MESSAGE } from "@shared/ini/engram-named-entries";

const RESULT_LIMIT = 20;
const CHOOSE_MATCH = "Choose a match, or enter the crate class.";

interface Props {
  ariaLabel: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onConfirm: (className: string) => void;
  onReject: (reason: string) => void;
  actionLabel?: string;
}

function matchingCrates(query: string): SupplyCrateCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  return supplyCrateCatalog()
    .filter((entry) => entry.label.toLowerCase().includes(needle) || entry.className.toLowerCase().includes(needle))
    .slice(0, RESULT_LIMIT);
}

function resolveCrateClass(query: string): { className: string } | { reason: string } | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  const byClass = lookupSupplyCrate(trimmed);
  if (byClass !== undefined) return { className: byClass.className };
  const labelHit = supplyCrateCatalog().some((entry) => entry.label.toLowerCase() === trimmed.toLowerCase());
  if (labelHit || !isSafeEngramClassName(trimmed)) {
    return { reason: isSafeEngramClassName(trimmed) ? CHOOSE_MATCH : UNSAFE_ENGRAM_CLASS_MESSAGE };
  }
  return { className: trimmed };
}

/** Catalog search plus a pasted class. Enter confirms. A display name does not replace the class. */
export function LootClassField(props: Props): ReactElement {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const options = useMemo(() => matchingCrates(props.value), [props.value]);
  const trimmed = props.value.trim();

  const confirm = (next: string): void => {
    const resolved = resolveCrateClass(next);
    if (resolved === null) return;
    if ("reason" in resolved) {
      props.onReject(resolved.reason);
      return;
    }
    props.onConfirm(resolved.className);
    combobox.closeDropdown();
  };

  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <Box flex={1}>
        <Combobox
          store={combobox}
          withinPortal
          position="bottom-start"
          width="target"
          onOptionSubmit={(value) => confirm(value)}
        >
          <Combobox.Target>
            <TextInput
              aria-label={props.ariaLabel}
              placeholder={props.placeholder ?? "Crate name or class"}
              size="xs"
              value={props.value}
              disabled={props.disabled}
              error={props.error !== undefined && props.error.length > 0 ? props.error : undefined}
              onFocus={() => combobox.openDropdown()}
              onChange={(event) => {
                props.onChange(event.currentTarget.value);
                combobox.openDropdown();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || combobox.getSelectedOptionIndex() >= 0) return;
                event.preventDefault();
                confirm(props.value);
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
              {trimmed.length === 0 ? <Combobox.Empty>Type a crate name or class.</Combobox.Empty> : null}
              {trimmed.length > 0 && options.length === 0 ? (
                <Combobox.Empty>No listed crate matches. Enter accepts a class name.</Combobox.Empty>
              ) : null}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Box>
      {props.actionLabel !== undefined ? (
        <Button size="xs" disabled={props.disabled || trimmed.length === 0} onClick={() => confirm(props.value)}>
          {props.actionLabel}
        </Button>
      ) : null}
    </Group>
  );
}
