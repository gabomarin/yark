import type { ReactElement } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Menu } from "@mantine/core";
import { getServerEnabledMenuState } from "./serverCardMenuActions";

interface Props {
  enabled: boolean;
  active: boolean;
  steamCmdBusy: boolean;
  onToggle?: () => void;
}

export function ServerEnabledMenuItem(props: Props): ReactElement {
  const state = getServerEnabledMenuState(props);

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
      disabled={state.disabled}
      title={state.title}
    >
      {state.label}
    </Menu.Item>
  );
}
