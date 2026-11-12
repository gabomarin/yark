import type { ReactElement } from "react";
import { Button, Menu } from "@mantine/core";
import { CaretDown, Copy } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import { showOperatorError } from "@ui/operatorToast";
import { formatModIdsCsv, selectModIdsForCopy, type ModIdCopyVariant } from "./serverModsModel";

interface Props {
  configuredIds: string[];
  disabledIds: ReadonlySet<string>;
  disabled: boolean;
}

async function copyVariant(
  configuredIds: string[],
  disabledIds: ReadonlySet<string>,
  variant: ModIdCopyVariant,
  successMessage: string,
): Promise<void> {
  const ids = selectModIdsForCopy(configuredIds, disabledIds, variant);
  if (ids.length === 0) {
    showOperatorError("No Project IDs to copy for that list", "Nothing to copy");
    return;
  }
  await copyTextToClipboard({
    text: formatModIdsCsv(ids),
    notifySuccess: true,
    successMessage,
    failureMessage: "Could not copy Project IDs",
  });
}

/**
 * Header menu: copy All / Enabled / Disabled ID lists (#634).
 * Paste lists into Add by ID — same apply path, no separate Import surface.
 */
export function ServerModsIdsMenu(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const hasMods = props.configuredIds.length > 0;

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          size={size}
          variant="default"
          disabled={props.disabled}
          leftSection={<Copy size={14} />}
          rightSection={<CaretDown size={14} />}
        >
          IDs
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Copy Project IDs</Menu.Label>
        <Menu.Item
          disabled={!hasMods}
          leftSection={<Copy size={14} />}
          onClick={() => void copyVariant(props.configuredIds, props.disabledIds, "all", "All Project IDs copied")}
        >
          Copy all
        </Menu.Item>
        <Menu.Item
          disabled={selectModIdsForCopy(props.configuredIds, props.disabledIds, "enabled").length === 0}
          leftSection={<Copy size={14} />}
          onClick={() =>
            void copyVariant(props.configuredIds, props.disabledIds, "enabled", "Enabled Project IDs copied (-mods=)")
          }
        >
          Copy enabled
        </Menu.Item>
        <Menu.Item
          disabled={selectModIdsForCopy(props.configuredIds, props.disabledIds, "disabled").length === 0}
          leftSection={<Copy size={14} />}
          onClick={() =>
            void copyVariant(props.configuredIds, props.disabledIds, "disabled", "Disabled Project IDs copied")
          }
        >
          Copy disabled
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
