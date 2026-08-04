import type { ReactElement } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, TextInput, type TextInputProps } from "@mantine/core";
import classes from "./PathField.module.css";

interface Props {
  label?: string;
  value: string;
  placeholder?: string;
  description?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Show Clear when the path is optional and currently set. */
  clearable?: boolean;
  size?: TextInputProps["size"];
  required?: boolean;
  id?: string;
  className?: string;
  /** Accessible name when label is omitted (inline layouts). */
  "aria-label"?: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

export function PathField({
  label,
  value,
  placeholder,
  description,
  busy = false,
  disabled = false,
  clearable = false,
  size = "sm",
  required,
  id,
  className,
  "aria-label": ariaLabel,
  onChange,
  onBrowse,
}: Props): ReactElement {
  const canClear = clearable && value.trim().length > 0 && !disabled && !busy;

  return (
    <Group
      align={label !== undefined ? "flex-end" : "center"}
      wrap="nowrap"
      gap="xs"
      className={className}
    >
      <TextInput
        id={id}
        className={classes.input}
        label={label}
        description={description}
        size={size}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly
        required={required}
        aria-label={ariaLabel}
        aria-readonly
      />
      <Button
        variant="default"
        size={size}
        leftSection={<FolderOpen size={size === "xs" ? 12 : 14} />}
        onClick={onBrowse}
        disabled={busy || disabled}
      >
        {busy ? "Opening..." : "Browse"}
      </Button>
      {clearable && (
        <Button
          variant="subtle"
          size={size}
          onClick={() => onChange("")}
          disabled={!canClear}
        >
          Clear
        </Button>
      )}
    </Group>
  );
}
