import type { ReactElement } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Menu } from "@mantine/core";

interface Props {
  enabled: boolean;
  active: boolean;
  steamCmdBusy: boolean;
  onToggle?: () => void;
}

export function ServerEnabledMenuItem(props: Props): ReactElement {
  const disabled =
    props.onToggle === undefined ||
    props.steamCmdBusy ||
    (props.enabled && props.active);
  const title =
    props.onToggle === undefined
      ? undefined
      : props.steamCmdBusy
        ? "Another server operation is in progress"
        : props.enabled && props.active
          ? "Stop the server first"
          : undefined;

  return (
    <Menu.Item
      leftSection={
        props.enabled ? (
          <EyeSlash size={16} color="var(--mantine-color-red-6)" />
        ) : (
          <Eye size={16} color="var(--mantine-color-blue-6)" />
        )
      }
      onClick={props.onToggle}
      disabled={disabled}
      title={title}
    >
      {props.enabled ? "Disable server" : "Enable server"}
    </Menu.Item>
  );
}
