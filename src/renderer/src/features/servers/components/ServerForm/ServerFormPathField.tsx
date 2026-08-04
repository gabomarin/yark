import type { ReactElement } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Group, TextInput } from "@mantine/core";
import classes from "./ServerForm.module.css";

interface Props {
  label: string;
  value: string;
  placeholder?: string;
  busy: boolean;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
  onChange: (value: string) => void;
  onBrowse: () => void;
}

/** Local path+Browse control for ServerForm (shared PathField is #52). */
export function ServerFormPathField({
  label,
  value,
  placeholder,
  busy,
  disabled = false,
  size = "sm",
  onChange,
  onBrowse,
}: Props): ReactElement {
  return (
    <Group align="flex-end" wrap="nowrap" gap="xs">
      <TextInput
        className={classes.pathInput}
        label={label}
        size={size}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <Button
        variant="default"
        size={size}
        leftSection={<FolderOpen size={14} />}
        onClick={onBrowse}
        disabled={busy || disabled}
      >
        {busy ? "Opening..." : "Browse"}
      </Button>
    </Group>
  );
}
