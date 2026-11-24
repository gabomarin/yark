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
  /** Inventory row selection (#635); drives Copy selected. */
  selectedIds?: readonly string[];
  disabled: boolean;
}

async function copyVariant(
  configuredIds: string[],
  disabledIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
  variant: ModIdCopyVariant,
  successMessage: string,
): Promise<void> {
  const ids = selectModIdsForCopy(configuredIds, disabledIds, variant, selectedIds);
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
 * Header menu: copy All / Enabled / Disabled / Selected ID lists (#634, #635).
 * Paste lists into Add by ID — same apply path, no separate Import surface.
 */
export function ServerModsIdsMenu(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const hasMods = props.configuredIds.length > 0;
  const selectedSet = new Set(props.selectedIds ?? []);
  const selectedCount = selectModIdsForCopy(props.configuredIds, props.disabledIds, "selected", selectedSet).length;

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
          onClick={() =>
            void copyVariant(props.configuredIds, props.disabledIds, selectedSet, "all", "All Project IDs copied")
          }
        >
          Copy all
        </Menu.Item>
        <Menu.Item
          disabled={selectModIdsForCopy(props.configuredIds, props.disabledIds, "enabled").length === 0}
          leftSection={<Copy size={14} />}
          onClick={() =>
            void copyVariant(
              props.configuredIds,
              props.disabledIds,
              selectedSet,
              "enabled",
              "Enabled Project IDs copied (-mods=)",
            )
          }
        >
          Copy enabled
        </Menu.Item>
        <Menu.Item
          disabled={selectModIdsForCopy(props.configuredIds, props.disabledIds, "disabled").length === 0}
          leftSection={<Copy size={14} />}
          onClick={() =>
            void copyVariant(
              props.configuredIds,
              props.disabledIds,
              selectedSet,
              "disabled",
              "Disabled Project IDs copied",
            )
          }
        >
          Copy disabled
        </Menu.Item>
        <Menu.Item
          disabled={selectedCount === 0}
          leftSection={<Copy size={14} />}
          onClick={() =>
            void copyVariant(
              props.configuredIds,
              props.disabledIds,
              selectedSet,
              "selected",
              "Selected Project IDs copied",
            )
          }
        >
          Copy selected
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
