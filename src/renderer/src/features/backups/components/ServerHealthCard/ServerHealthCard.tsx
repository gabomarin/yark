import type { ReactElement } from "react";
import {
  ArrowSquareOut,
  FloppyDisk,
  FolderOpen,
  HardDrives,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { PathField } from "@ui/PathField/PathField";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import type { BackupServerHealth, ServerProfile } from "@shared/types";
import type { BackupPolicyDraft } from "../../backupPolicyDraft";
import {
  backupHealthColor,
  backupHealthLabel,
  backupHealthTooltip,
  formatBackupBytes,
  formatBackupWhen,
} from "../../backupsPageModel";
import classes from "../../BackupsPage.module.css";

export interface ServerHealthCardProps {
  row: BackupServerHealth;
  draft: BackupPolicyDraft | undefined;
  expanded: boolean;
  busy: boolean;
  browsing: boolean;
  server: ServerProfile | undefined;
  onToggleExpand: () => void;
  onOpenDestination: () => void;
  onOpenServer: () => void;
  onBrowse: () => void;
  onDraftChange: (draft: BackupPolicyDraft) => void;
  onSave: () => void;
}

export function ServerHealthCard(props: ServerHealthCardProps): ReactElement {
  const { row, draft } = props;
  return (
    <AppSurfaceCard>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="xs">
              <HardDrives size={16} />
              <Title order={4}>{row.serverName}</Title>
              {props.server?.enabled === false && (
                <Badge size="xs" color="gray" variant="light">
                  Inactive
                </Badge>
              )}
              <Tooltip
                label={backupHealthTooltip(row.health)}
                multiline
                maw={320}
                withArrow
              >
                <Badge color={backupHealthColor(row.health)} variant="light">
                  {backupHealthLabel(row.health)}
                </Badge>
              </Tooltip>
              {row.policy.enabled ? (
                <Badge color="teal" variant="outline">
                  Schedule {row.policy.intervalMinutes}m
                </Badge>
              ) : (
                <Badge color="gray" variant="outline">
                  Schedule off
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed" mb={4}>
              Destination
            </Text>
            <ReadonlyPath value={row.resolvedRoot} compact />
            <Text size="xs" c="dimmed">
              Latest: {formatBackupWhen(row.latest?.createdAt)}
              {row.latest !== null
                ? ` (${row.latest.kind} · ${row.latest.type} · ${row.latest.status})`
                : ""}
            </Text>
            <Text size="xs" c="dimmed">
              Counts – world {row.counts.world} · players {row.counts.players} · ini{" "}
              {row.counts.ini}
              {row.counts.failed24h > 0 ? ` · failed 24h ${row.counts.failed24h}` : ""}
              {" · "}
              used {formatBackupBytes(row.usedBytes)}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="subtle"
              leftSection={<FolderOpen size={16} />}
              onClick={props.onOpenDestination}
              disabled={props.busy}
            >
              Open destination
            </Button>
            <Button
              variant="light"
              leftSection={<ArrowSquareOut size={16} />}
              onClick={props.onOpenServer}
            >
              Open in server
            </Button>
            <Button variant="default" onClick={props.onToggleExpand}>
              {props.expanded ? "Hide settings" : "Edit settings"}
            </Button>
          </Group>
        </Group>

        {props.expanded && draft !== undefined && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Destination and schedule apply to <strong>world</strong> backups.
              Players and INI use the same root but their own triggers and retain
              counts.
            </Text>
            <PathField
              className={classes.dirField}
              label="Backup destination"
              description={
                draft.backupDir === null || draft.backupDir.length === 0
                  ? `Default: ${props.server?.installDir ?? ""}\\Backups`
                  : `Effective: ${row.resolvedRoot}`
              }
              value={draft.backupDir ?? ""}
              placeholder={`${props.server?.installDir ?? ""}\\Backups`}
              busy={props.browsing}
              clearable
              onChange={(value) =>
                props.onDraftChange({
                  ...draft,
                  backupDir: value.trim().length > 0 ? value : null,
                })
              }
              onBrowse={props.onBrowse}
            />
            <Group align="flex-end" gap="md" wrap="wrap">
              <Switch
                label="Enable scheduled world backups"
                checked={draft.enabled}
                onChange={(event) =>
                  props.onDraftChange({
                    ...draft,
                    enabled: event.currentTarget.checked,
                  })
                }
              />
              <NumberInput
                label="Interval (minutes)"
                description="Min 5 · default 60 · world only"
                min={5}
                max={10_080}
                value={draft.intervalMinutes}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    intervalMinutes:
                      typeof value === "number" ? value : draft.intervalMinutes,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last world"
                min={1}
                max={500}
                value={draft.retainCountWorld}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountWorld:
                      typeof value === "number" ? value : draft.retainCountWorld,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last players"
                description="Per player"
                min={1}
                max={500}
                value={draft.retainCountPlayers}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountPlayers:
                      typeof value === "number" ? value : draft.retainCountPlayers,
                  })
                }
                className={classes.policyField}
              />
              <NumberInput
                label="Keep last INI"
                min={1}
                max={500}
                value={draft.retainCountIni}
                onChange={(value) =>
                  props.onDraftChange({
                    ...draft,
                    retainCountIni:
                      typeof value === "number" ? value : draft.retainCountIni,
                  })
                }
                className={classes.policyField}
              />
              <Button
                leftSection={<FloppyDisk size={16} />}
                loading={props.busy}
                onClick={props.onSave}
              >
                Save
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
