import type { ReactElement, ReactNode } from "react";
import { Group, Stack, Text } from "@mantine/core";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";

interface Props {
  activeCount: number;
  disabledCount: number;
  /** When &gt; 0, shown on the same status line as active/disabled (#635). */
  selectedCount?: number;
  /** Server-view quick actions (#637); omitted on Discover. */
  actions?: ReactNode;
}

export function ServerModsHeader(props: Props): ReactElement {
  const selectedCount = props.selectedCount ?? 0;
  const statusLine =
    props.disabledCount > 0
      ? `${props.activeCount} active · ${props.disabledCount} disabled`
      : `${props.activeCount} active`;

  return (
    <WorkspaceSectionHeader
      title="Mods"
      subtitle="Add a CurseForge Project ID or mod URL here. Discover searches the catalog — it is not the same as pasting an ID."
      actions={
        <Stack gap="sm" align="flex-end">
          {props.actions}
          <Group gap={6} justify="flex-end" wrap="nowrap" data-mods-status-counts>
            {selectedCount > 0 && (
              <>
                <Text size="sm" fw={600} lh={1.2} data-mods-selection-count>
                  {selectedCount} selected
                </Text>
                <Text size="sm" c="dimmed" lh={1.2} aria-hidden>
                  ·
                </Text>
              </>
            )}
            <Text size="sm" c="dimmed" lh={1.2}>
              {statusLine}
            </Text>
          </Group>
        </Stack>
      }
    />
  );
}
