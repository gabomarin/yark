import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { Group, Select, Stack, Title } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { BackupFleetSummary, ServerProfile } from "@shared/types";
import type { BackupPolicyDraft } from "../../backupPolicyDraft";
import type { BackupHealthFilter } from "../../model/backupsPageModel";
import { ServerHealthCard } from "../ServerHealthCard/ServerHealthCard";

interface Props {
  filteredServers: BackupFleetSummary["servers"];
  drafts: Record<string, BackupPolicyDraft>;
  expandedId: string | null;
  busyId: string | null;
  browsingId: string | null;
  healthFilter: BackupHealthFilter;
  onHealthFilter: (value: BackupHealthFilter) => void;
  serverById: Map<string, ServerProfile>;
  onToggleExpand: (serverId: string) => void;
  onOpenDestination: (serverId: string) => void;
  onOpenServer: (serverId: string) => void;
  onBrowse: (server: ServerProfile) => void;
  onDraftChange: (serverId: string, next: BackupPolicyDraft) => void;
  onSave: (serverId: string) => void;
}

export function BackupsPageServerSection(props: Props): ReactElement {
  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={4}>Servers</Title>
        <Select
          aria-label="Filter servers by health"
          value={props.healthFilter}
          onChange={(value) =>
            props.onHealthFilter((value as BackupHealthFilter) ?? "all")
          }
          data={[
            { value: "all", label: "All" },
            { value: "protected", label: "Protected" },
            { value: "at_risk", label: "At risk" },
            { value: "failed", label: "Failed (24h)" },
          ]}
          w={160}
        />
      </Group>

      <Stack gap="sm">
        {props.filteredServers.length === 0 ? (
          <AppSurfaceCard>
            <EmptyState
              icon={<HardDrives size={22} />}
              title="No matches"
              description="No servers match this filter."
            />
          </AppSurfaceCard>
        ) : (
          props.filteredServers.map((row) => {
            const draft = props.drafts[row.serverId];
            const expanded = props.expandedId === row.serverId;
            const busy = props.busyId === row.serverId;
            const server = props.serverById.get(row.serverId);
            return (
              <ServerHealthCard
                key={row.serverId}
                row={row}
                draft={draft}
                expanded={expanded}
                busy={busy}
                browsing={props.browsingId === row.serverId}
                server={server}
                onToggleExpand={() => props.onToggleExpand(row.serverId)}
                onOpenDestination={() => props.onOpenDestination(row.serverId)}
                onOpenServer={() => props.onOpenServer(row.serverId)}
                onBrowse={() => server && props.onBrowse(server)}
                onDraftChange={(next) => props.onDraftChange(row.serverId, next)}
                onSave={() => props.onSave(row.serverId)}
              />
            );
          })
        )}
      </Stack>
    </>
  );
}
