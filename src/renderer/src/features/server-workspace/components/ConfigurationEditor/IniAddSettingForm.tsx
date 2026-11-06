import { Combobox, Group, Button, Input, NumberInput, Text, TextInput, useCombobox } from "@mantine/core";
import { useMemo, useState, type KeyboardEvent, type ReactElement } from "react";
import type { IniFileKey } from "@shared/types";
import type { IniSettingInput } from "@shared/ini/ini-setting-meta";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import { numberInputValueFromIni } from "../../iniNumberInput";
import classes from "./ConfigurationEditor.module.css";
import {
  addableIniSettingsForSection,
  canonicalIniSection,
  canonicalIniSettingKey,
  iniSectionError,
  iniSettingKeyError,
  keysInSectionOrEmpty,
  type AddableIniSetting,
} from "./iniAddSettingModel";

interface Props {
  fileKey: IniFileKey;
  section: string;
  sections: readonly string[];
  keysInSection: ReadonlyMap<string, ReadonlySet<string>>;
  busy: boolean;
  onSectionChange: (section: string) => void;
  onCommit: (section: string, key: string, value: string) => void;
  onCancel: () => void;
}

function booleanChecked(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function onFormKeyDown(
  event: KeyboardEvent<HTMLElement>,
  commit: () => void,
  cancel: () => void,
  blockEnter: boolean,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== "Enter" || blockEnter) return;
  event.preventDefault();
  commit();
}

function ValueControl(props: {
  input: IniSettingInput | null;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}): ReactElement {
  const input = props.input;
  if (input?.type === "boolean") {
    return (
      <Input.Wrapper label="Value">
        <AppSwitch
          aria-label="Value"
          label={booleanChecked(props.value) ? "True" : "False"}
          checked={booleanChecked(props.value)}
          disabled={props.disabled}
          onCheckedChange={(checked) => props.onChange(checked ? "True" : "False")}
        />
      </Input.Wrapper>
    );
  }
  if (input?.type === "number" || input?.type === "range") {
    return (
      <NumberInput
        label="Value"
        aria-label="Value"
        disabled={props.disabled}
        min={input.min}
        max={input.max}
        step={input.step}
        decimalScale={input.type === "number" && input.integer === true ? 0 : 4}
        placeholder="Blank is fine"
        hideControls
        value={numberInputValueFromIni(props.value)}
        onKeyDown={props.onKeyDown}
        onChange={(value) => props.onChange(value === "" || value === undefined ? "" : String(value))}
      />
    );
  }
  return (
    <TextInput
      label="Value"
      aria-label="Value"
      placeholder="Blank is fine"
      disabled={props.disabled}
      value={props.value}
      onKeyDown={props.onKeyDown}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

export function IniAddSettingForm(props: Props): ReactElement {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [input, setInput] = useState<IniSettingInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionQuery, setSectionQuery] = useState(props.section);
  const [seenSection, setSeenSection] = useState(props.section);
  if (props.section !== seenSection) {
    setSeenSection(props.section);
    setSectionQuery(props.section);
  }
  const nameCombobox = useCombobox({ onDropdownClose: () => nameCombobox.resetSelectedOption() });
  const presentKeys = keysInSectionOrEmpty(props.keysInSection, props.section);
  const choices = useMemo(
    () => addableIniSettingsForSection(props.fileKey, props.section, presentKeys),
    [props.fileKey, props.section, presentKeys],
  );
  const needle = query.trim().toLowerCase();
  const shown = choices.filter((choice) => {
    if (needle.length === 0) return true;
    return choice.key.toLowerCase().includes(needle) || choice.description.toLowerCase().includes(needle);
  });
  const matched = choices.find((choice) => choice.key.toLowerCase() === needle);
  const helper = matched?.description ?? "Known settings show up as you type. Any other name is added as plain text.";

  const applyChoice = (choice: AddableIniSetting): void => {
    setQuery(choice.key);
    setValue(choice.defaultValue);
    setInput(choice.input);
    setError(null);
    nameCombobox.closeDropdown();
  };

  const applySection = (raw: string): void => {
    const resolved = canonicalIniSection(raw, props.sections);
    const nextError = iniSectionError(resolved);
    if (nextError !== null) {
      setSectionError(nextError);
      return;
    }
    setSectionError(null);
    setSectionQuery(resolved);
    if (resolved === props.section) return;
    setQuery("");
    setValue("");
    setInput(null);
    setError(null);
    props.onSectionChange(resolved);
  };

  const commit = (): void => {
    const nextSectionError = iniSectionError(props.section);
    if (nextSectionError !== null) {
      setSectionError(nextSectionError);
      return;
    }
    setSectionError(null);
    setSectionQuery(props.section);
    const key = canonicalIniSettingKey(query, choices);
    const keyError = iniSettingKeyError(key, presentKeys);
    if (keyError !== null) {
      setError(keyError);
      return;
    }
    props.onCommit(props.section, key, value);
  };

  return (
    <div className={classes.addSettingForm} data-ini-add-form="">
      <Text fw={600} size="sm">
        Add setting
      </Text>
      <div className={classes.addSettingFields}>
        <SectionField
          query={sectionQuery}
          sections={props.sections}
          disabled={props.busy}
          error={sectionError}
          onQueryChange={(next) => {
            setSectionQuery(next);
            setSectionError(null);
          }}
          onConfirm={applySection}
          onRevert={() => {
            setSectionQuery(props.section);
            setSectionError(null);
          }}
          onCancel={props.onCancel}
        />
        <Combobox
          store={nameCombobox}
          withinPortal
          onOptionSubmit={(next) => {
            const choice = choices.find((item) => item.key === next);
            if (choice !== undefined) applyChoice(choice);
          }}
        >
          <Combobox.Target>
            <TextInput
              label="Setting"
              aria-label="Setting"
              placeholder="Search known settings, or type your own"
              value={query}
              error={error}
              disabled={props.busy}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setQuery(next);
                setError(null);
                const choice = choices.find((item) => item.key.toLowerCase() === next.trim().toLowerCase());
                if (choice !== undefined) {
                  setValue(choice.defaultValue);
                  setInput(choice.input);
                } else {
                  setInput(null);
                }
                nameCombobox.openDropdown();
                nameCombobox.updateSelectedOptionIndex();
              }}
              onFocus={() => nameCombobox.openDropdown()}
              onKeyDown={(event) =>
                onFormKeyDown(event, commit, props.onCancel, nameCombobox.getSelectedOptionIndex() >= 0)
              }
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options style={{ maxHeight: 220, overflowY: "auto" }}>
              {shown.map((choice) => (
                <Combobox.Option key={choice.key} value={choice.key}>
                  <Text size="xs" fw={600}>
                    {choice.key}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {choice.description}
                  </Text>
                </Combobox.Option>
              ))}
              {shown.length === 0 ? (
                <Combobox.Empty>
                  {needle.length > 0
                    ? "No known setting matches. You can still add this name."
                    : "This section already has every known setting. You can still add your own."}
                </Combobox.Empty>
              ) : null}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
        <ValueControl
          input={input}
          value={value}
          disabled={props.busy}
          onChange={setValue}
          onKeyDown={(event) => onFormKeyDown(event, commit, props.onCancel, false)}
        />
      </div>
      <Text c="dimmed" size="sm" lineClamp={3}>
        {helper}
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </Button>
        <Button disabled={props.busy} onClick={commit}>
          Add setting
        </Button>
      </Group>
    </div>
  );
}

function SectionField(props: {
  query: string;
  sections: readonly string[];
  disabled: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onConfirm: (section: string) => void;
  onRevert: () => void;
  onCancel: () => void;
}): ReactElement {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const needle = props.query.trim().toLowerCase();
  const typed = canonicalIniSection(props.query, props.sections);
  const exact = props.sections.some((section) => section.toLowerCase() === typed.toLowerCase());
  const shown = exact ? props.sections : props.sections.filter((section) => section.toLowerCase().includes(needle));
  const showCreate = needle.length > 0 && !exact && iniSectionError(typed) === null;

  const confirmTyped = (): void => {
    if (!exact) return;
    props.onConfirm(typed);
    combobox.closeDropdown();
  };

  return (
    <Combobox
      store={combobox}
      withinPortal
      onOptionSubmit={(next) => {
        props.onConfirm(next === "__create__" ? typed : next);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          label="Section"
          aria-label="Section"
          placeholder="ServerSettings, or a mod section"
          value={props.query}
          error={props.error}
          disabled={props.disabled}
          onChange={(event) => {
            props.onQueryChange(event.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onBlur={() => {
            if (exact) props.onConfirm(typed);
            else props.onRevert();
            combobox.closeDropdown();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
              return;
            }
            if (event.key !== "Enter" || combobox.getSelectedOptionIndex() >= 0) return;
            event.preventDefault();
            confirmTyped();
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options style={{ maxHeight: 220, overflowY: "auto" }}>
          {shown.map((section) => (
            <Combobox.Option key={section} value={section}>
              {section}
            </Combobox.Option>
          ))}
          {showCreate ? <Combobox.Option value="__create__">{`Add section "${typed}"`}</Combobox.Option> : null}
          {shown.length === 0 && !showCreate ? (
            <Combobox.Empty>Type a section name, such as a mod section.</Combobox.Empty>
          ) : null}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
