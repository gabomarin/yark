import type { ReactElement, ReactNode } from "react";
import { Group, Text } from "@mantine/core";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";

interface Props {
  activeCount: number;
  disabledCount: number;
  /** When &gt; 0, shown on its own header toolbar line (#635). */
  selectedCount?: number;
  /** Server-view quick actions (#637); omitted on Discover. */
  actions?: ReactNode;
}

export function ServerModsHeader(props: Props): ReactElement {
  const selectedCount = props.selectedCount ?? 0;
  return (
    <WorkspaceSectionHeader
      title="Mods"
      subtitle="Add a CurseForge Project ID or mod URL here. Discover searches the catalog — it is not the same as pasting an ID."
      actions={
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" c="dimmed">
            {props.activeCount} active
          </Text>
          {props.disabledCount > 0 && (
            <Text size="sm" c="dimmed">
              {props.disabledCount} disabled
            </Text>
          )}
          {props.actions}
        </Group>
      }
      toolbar={
        selectedCount > 0 ? (
          <Text size="sm" fw={600} data-mods-selection-count>
            {selectedCount} selected
          </Text>
        ) : undefined
      }
    />
  );
}
