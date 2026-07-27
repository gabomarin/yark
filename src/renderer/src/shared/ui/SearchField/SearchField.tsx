import { MagnifyingGlass } from "@phosphor-icons/react";
import { TextInput, type TextInputProps } from "@mantine/core";
import classes from "./SearchField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  size?: TextInputProps["size"];
  className?: string;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  size,
  className,
}: Props): JSX.Element {
  return (
    <TextInput
      aria-label={label ?? "Search"}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      size={size}
      className={className}
      leftSection={<MagnifyingGlass size={size === "xs" ? 14 : 16} />}
      classNames={{ input: classes.input, section: classes.section }}
    />
  );
}
