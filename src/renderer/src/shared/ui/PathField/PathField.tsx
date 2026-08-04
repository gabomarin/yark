import type { ReactElement } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, Text, type TextInputProps } from "@mantine/core";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import classes from "./PathField.module.css";

interface Props {
  label?: string;
  value: string;
  /** Empty-state copy inside the path chip (Settings-style). */
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
  /**
   * When true, omit the stacked label chrome and render only chip + actions
   * (for rows that already have an external label).
   */
  inline?: boolean;
  /** Accessible name when label is omitted. */
  "aria-label"?: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

export function PathField({
  label,
  value,
  placeholder = "Not set",
  description,
  busy = false,
  disabled = false,
  clearable = false,
  size = "sm",
  required,
  id,
  className,
  inline = false,
  "aria-label": ariaLabel,
  onChange,
  onBrowse,
}: Props): ReactElement {
  const canClear = clearable && value.trim().length > 0 && !disabled && !busy;
  const compact = size === "xs";
  const pathLabel = ariaLabel ?? label ?? "Path";

  const row = (
    <div className={classes.row}>
      <ReadonlyPath
        id={id}
        className={classes.chip}
        value={value}
        emptyLabel={placeholder}
        compact={compact}
        aria-label={pathLabel}
      />
      <Group gap="xs" wrap="wrap" className={classes.actions}>
        <Button
          variant="default"
          size={size}
          leftSection={<FolderOpen size={compact ? 12 : 14} />}
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
    </div>
  );

  if (inline) {
    return (
      <div className={[classes.root, classes.inline, className].filter(Boolean).join(" ")}>
        {row}
      </div>
    );
  }

  return (
    <div className={[classes.root, className].filter(Boolean).join(" ")}>
      {label !== undefined && (
        <Text size="sm" fw={500}>
          {label}
          {required === true ? " *" : ""}
        </Text>
      )}
      {description !== undefined && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      {row}
    </div>
  );
}
