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
  /** Visible Mantine input label (Discover, labeled search forms). */
  fieldLabel?: string;
  size?: TextInputProps["size"];
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
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
  return (
    <TextInput
      aria-label={fieldLabel === undefined ? (label ?? "Search") : undefined}
      label={fieldLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      size={size}
      className={className}
      leftSection={<MagnifyingGlass size={size === "xs" ? 14 : 16} />}
      classNames={{ input: classes.input, section: classes.section }}
    />
  );
}
