import { useMemo, type ReactElement } from "react";
import { Combobox, Text, TextInput, useCombobox } from "@mantine/core";
import { asaEngramEntries, lookupAsaEngram, type AsaEngramEntry } from "@shared/asa/asa-engram-catalog";
import { isSafeEngramClassName, UNSAFE_ENGRAM_CLASS_MESSAGE } from "@shared/ini/engram-named-entries";

const RESULT_LIMIT = 40;
const CHOOSE_MATCH = "Choose a match, or enter the engram class name.";

interface Props {
  ariaLabel: string;
  value: string;
  disabled?: boolean;
  error?: string;
  usedClassNames: ReadonlySet<string>;
  onChange: (value: string) => void;
  onConfirm: (className: string) => void;
  onReject: (reason: string) => void;
}

function matchingEngrams(query: string): AsaEngramEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const matches = asaEngramEntries.filter(
    (entry) => entry.label.toLowerCase().includes(needle) || entry.className.toLowerCase().includes(needle),
  );
  matches.sort((a, b) => {
    const aStart = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
    const bStart = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
    return aStart - bStart || a.label.localeCompare(b.label);
  });
  return matches.slice(0, RESULT_LIMIT);
}

function resolveEngramClass(query: string): { className: string } | { reason: string } | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  const byClass = lookupAsaEngram(trimmed);
  if (byClass !== undefined) return { className: byClass.className };
  const labelHit = asaEngramEntries.some((entry) => entry.label.toLowerCase() === trimmed.toLowerCase());
  if (labelHit || !isSafeEngramClassName(trimmed)) {
    const unsafe = /["\\\r\n,()=;#]/.test(trimmed);
    return { reason: unsafe ? UNSAFE_ENGRAM_CLASS_MESSAGE : CHOOSE_MATCH };
  }
  return { className: trimmed };
}

/** Catalog search plus a typed class. Enter without a highlighted option follows the free-text rules. */
export function EngramClassField(props: Props): ReactElement {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const options = useMemo(() => matchingEngrams(props.value), [props.value]);
  const trimmed = props.value.trim();

  const confirm = (next: string): void => {
    const resolved = resolveEngramClass(next);
    if (resolved === null) return;
    if ("reason" in resolved) {
      props.onReject(resolved.reason);
      return;
    }
    props.onConfirm(resolved.className);
    combobox.closeDropdown();
  };

  return (
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
          placeholder="Engram name or class"
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
        <Combobox.Options style={{ maxHeight: 280, overflowY: "auto" }}>
          {options.map((entry) => (
            <Combobox.Option key={entry.className} value={entry.className}>
              <Text size="sm">{entry.label}</Text>
              <Text size="xs" c="dimmed">
                {entry.className}
                {props.usedClassNames.has(entry.className.toLowerCase()) ? " · Already in this file" : ""}
              </Text>
            </Combobox.Option>
          ))}
          {trimmed.length === 0 ? <Combobox.Empty>Type an engram name or class.</Combobox.Empty> : null}
          {trimmed.length > 0 && options.length === 0 ? (
            <Combobox.Empty>No official engram matches. Enter accepts a class name.</Combobox.Empty>
          ) : null}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
