import { MagnifyingGlass } from "@phosphor-icons/react";
import { TextInput } from "@mantine/core";
import classes from "./SearchField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchField({ value, onChange, placeholder, label }: Props): JSX.Element {
  return (
    <TextInput
      aria-label={label ?? "Search"}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      leftSection={<MagnifyingGlass size={16} />}
      classNames={{ input: classes.input, section: classes.section }}
    />
  );
}