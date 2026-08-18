import type { KeyboardEvent, ReactElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { TextInput, type TextInputProps } from "@mantine/core";
import classes from "./SearchField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name when there is no visible `fieldLabel`. */
  label?: string;
  /** Visible Mantine caption. Empty/whitespace is treated as unset. */
  fieldLabel?: string;
  /**
   * Mantine input size. `xs` (14px icon) is the compact workspace rail
   * (`ServerListPanel`); `sm`/`md` use a 16px icon.
   */
  size?: TextInputProps["size"];
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Phosphor size for the leading search icon (`xs` rail vs default fields). */
export function searchFieldIconSize(size?: TextInputProps["size"]): number {
  return size === "xs" ? 14 : 16;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  fieldLabel,
  size,
  className,
  onKeyDown,
}: Props): ReactElement {
  const visibleLabel =
    fieldLabel !== undefined && fieldLabel.trim().length > 0
      ? fieldLabel
      : undefined;

  return (
    <TextInput
      aria-label={visibleLabel === undefined ? (label ?? "Search") : undefined}
      label={visibleLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      size={size}
      className={className}
      leftSection={<MagnifyingGlass size={searchFieldIconSize(size)} />}
      classNames={{ input: classes.input, section: classes.section }}
    />
  );
}
