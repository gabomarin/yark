import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import type { ServerIniSnapshot, ServerProfile } from "@shared/types";
import { MAP_TRIBUTE_KEYS, readMapTributeValues, readTributeValues } from "../../tributeModel";

interface Props {
  members: ServerProfile[];
  snapshots: Map<string, ServerIniSnapshot>;
}

export function MapTributeSummary(props: Props): ReactElement | null {
  const configuredMembers = props.members.filter((member) => {
    const snapshot = props.snapshots.get(member.id);
    if (snapshot === undefined) return false;
    const values = readMapTributeValues(readTributeValues(snapshot.payload.gameUserSettings));
    return MAP_TRIBUTE_KEYS.some((key) => values[key]);
  });

  if (configuredMembers.length === 0) return null;

  return (
    <Text size="xs" c="dimmed">
      Per-map transfer overrides are active on {configuredMembers.length} server
      {configuredMembers.length === 1 ? "" : "s"}. Manage them in each server&apos;s INI Files tab.
    </Text>
  );
}
