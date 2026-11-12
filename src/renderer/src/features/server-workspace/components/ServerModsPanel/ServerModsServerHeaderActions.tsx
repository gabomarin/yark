import type { ReactElement } from "react";
import { Button, Group } from "@mantine/core";
import { ServerModsIdsMenu } from "./ServerModsIdsMenu";
import { confirmRemoveDisabledMods } from "./confirmRemoveServerMod";

interface Props {
  configuredIds: string[];
  disabledIds: ReadonlySet<string>;
  disabledCount: number;
  listBusy: boolean;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onRemoveAllDisabled: () => void;
}

/**
 * Server-view header actions: IDs menu (#634) + bulk enable/disable/remove (#637).
 */
export function ServerModsServerHeaderActions(props: Props): ReactElement {
  const hasMods = props.configuredIds.length > 0;
  return (
    <Group gap={4} wrap="nowrap">
      <ServerModsIdsMenu
        configuredIds={props.configuredIds}
        disabledIds={props.disabledIds}
        disabled={props.listBusy}
      />
      <Button
        size="xs"
        variant="default"
        disabled={props.listBusy || !hasMods || props.disabledCount === 0}
        onClick={props.onEnableAll}
      >
        Enable all
      </Button>
      <Button
        size="xs"
        variant="default"
        disabled={props.listBusy || !hasMods || props.disabledCount === props.configuredIds.length}
        onClick={props.onDisableAll}
      >
        Disable all
      </Button>
      <Button
        size="xs"
        variant="default"
        color="red"
        disabled={props.listBusy || !hasMods || props.disabledCount === 0}
        onClick={() => confirmRemoveDisabledMods(props.disabledCount, props.onRemoveAllDisabled)}
      >
        Remove all disabled
      </Button>
    </Group>
  );
}
