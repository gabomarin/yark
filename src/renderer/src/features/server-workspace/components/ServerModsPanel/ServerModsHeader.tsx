import type { ReactElement, ReactNode } from "react";
import { Group, Text } from "@mantine/core";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";

interface Props {
  activeCount: number;
  disabledCount: number;
  /** Server-view quick actions (#637); omitted on Discover. */
  actions?: ReactNode;
}

export function ServerModsHeader(props: Props): ReactElement {
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
    />
  );
}
