import { ArrowSquareOut, FloppyDisk, FolderOpen, HardDrives } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import type {
  BackupPolicy,
  BackupRecord,
  ServerProfile,
} from "@shared/types";
import { useEffect, useState } from "react";
import classes from "./BackupsPage.module.css";

interface ServerBackupSummary {
  server: ServerProfile;
  policy: BackupPolicy | null;
  resolvedRoot: string | null;
  latest: BackupRecord | null;
  error: string | null;
}

interface Props {
  servers: ServerProfile[];
  onOpenServerBackups: (serverId: string) => void;
}

type DraftPolicy = Omit<BackupPolicy, "serverId" | "updatedAt">;

function formatWhen(iso: string | null | undefined): string {
  if (iso == null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function toDraft(policy: BackupPolicy): DraftPolicy {
  return {
    enabled: policy.enabled,
    intervalMinutes: policy.intervalMinutes,
    retainCountWorld: policy.retainCountWorld,
    retainCountPlayers: policy.retainCountPlayers,
    retainCountIni: policy.retainCountIni,
    backupDir: policy.backupDir,
  };
}

export function BackupsPage(props: Props): JSX.Element {
  const [rows, setRows] = useState<ServerBackupSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPolicy>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    if (props.servers.length === 0) {
      setRows([]);
      setDrafts({});
      setLoading(false);
      return;
    }

    const nextRows: ServerBackupSummary[] = [];
    const nextDrafts: Record<string, DraftPolicy> = {};

    for (const server of props.servers) {
      const [policyRes, rootRes, listRes] = await Promise.all([
        window.api.getBackupPolicy(server.id),
        window.api.resolveBackupRoot(server.id),
        window.api.listBackups(server.id, 1),
      ]);

      if (!policyRes.ok) {
        nextRows.push({
          server,
          policy: null,
          resolvedRoot: null,
          latest: null,
          error: policyRes.error ?? "Could not load policy",
        });
        continue;
      }

      nextDrafts[server.id] = toDraft(policyRes.data);

      nextRows.push({
        server,
        policy: policyRes.data,
        resolvedRoot: rootRes.ok ? rootRes.data : null,
        latest: listRes.ok ? (listRes.data[0] ?? null) : null,
        error: listRes.ok ? null : (listRes.error ?? "Could not load backups"),
      });
    }

    setRows(nextRows);
    setDrafts(nextDrafts);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [props.servers]);

  const savePolicy = async (serverId: string) => {
    const draft = drafts[serverId];
    if (draft === undefined) return;
    setBusyId(serverId);
    setError(null);
    setInfo(null);
    const result = await window.api.setBackupPolicy(serverId, draft);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not save backup policy");
      return;
    }
    await load();
    setInfo(`Saved backup settings for the selected server.`);
  };

  const browseBackupDir = async (server: ServerProfile) => {
    const draft = drafts[server.id];
    if (draft === undefined) return;
    setBrowsingId(server.id);
    const result = await window.api.pickPath(
      "directory",
      draft.backupDir ?? server.installDir,
      `Backup destination for ${server.name}`,
    );
    setBrowsingId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not open folder picker");
      return;
    }
    if (result.data !== null) {
      setDrafts((previous) => ({
        ...previous,
        [server.id]: { ...draft, backupDir: result.data },
      }));
    }
  };

  const openDestination = async (serverId: string) => {
    setBusyId(serverId);
    setError(null);
    const result = await window.api.openBackupRoot(serverId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not open backup destination");
    }
  };

  return (
    <PageScaffold
      title="Backup settings"
      subtitle="World schedule and shared destination per server. Player retention and INI retention are edited in each server’s Backups tab. Scheduled backups are world-only; players backup on join/leave; INI backups after save."
      fillViewport
    >
      <Stack gap="md" className={classes.content}>
        {error !== null && (
          <Alert color="red" title="Backups" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {info !== null && (
          <Alert color="teal" title="Backups" withCloseButton onClose={() => setInfo(null)}>
            {info}
          </Alert>
        )}

        {props.servers.length === 0 ? (
          <Card withBorder className={classes.panel}>
            <Text c="dimmed">Create a server first to configure backups.</Text>
          </Card>
        ) : loading && rows.length === 0 ? (
          <Card withBorder className={classes.panel}>
            <Text c="dimmed">Loading backup settings…</Text>
          </Card>
        ) : (
          <Stack gap="sm">
            {rows.map((row) => {
              const draft = drafts[row.server.id];
              const expanded = expandedId === row.server.id;
              const busy = busyId === row.server.id;
              return (
                <Card key={row.server.id} withBorder className={classes.panel}>
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                      <div>
                        <Group gap="xs">
                          <HardDrives size={16} />
                          <Title order={4}>{row.server.name}</Title>
                          {row.policy?.enabled === true ? (
                            <Badge color="teal" variant="light">
                              World schedule on
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              World schedule off
                            </Badge>
                          )}
                        </Group>
                        <Text size="sm" c="dimmed">
                          Destination: {row.resolvedRoot ?? `${row.server.installDir}\\Backups`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Latest backup: {formatWhen(row.latest?.createdAt)}
                          {row.latest !== null
                            ? ` (${
                                row.latest.kind === "world"
                                  ? "World"
                                  : row.latest.kind === "players"
                                    ? "Players"
                                    : "INI"
                              } · ${row.latest.type})`
                            : ""}
                        </Text>
                        {row.policy !== null && (
                          <Text size="xs" c="dimmed">
                            Retain — world {row.policy.retainCountWorld} · players{" "}
                            {row.policy.retainCountPlayers}/player · ini{" "}
                            {row.policy.retainCountIni}
                          </Text>
                        )}
                        {row.error !== null && (
                          <Text size="xs" c="red">
                            {row.error}
                          </Text>
                        )}
                      </div>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          leftSection={<FolderOpen size={16} />}
                          onClick={() => void openDestination(row.server.id)}
                          disabled={busy}
                        >
                          Open destination
                        </Button>
                        <Button
                          variant="light"
                          leftSection={<ArrowSquareOut size={16} />}
                          onClick={() => props.onOpenServerBackups(row.server.id)}
                        >
                          Open in server
                        </Button>
                        <Button
                          variant="default"
                          onClick={() =>
                            setExpandedId(expanded ? null : row.server.id)
                          }
                        >
                          {expanded ? "Hide settings" : "Edit settings"}
                        </Button>
                      </Group>
                    </Group>

                    {expanded && draft !== undefined && (
                      <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                          Destination and schedule apply to <strong>world</strong>{" "}
                          backups. Players and INI use the same root but their own
                          triggers and retain counts.
                        </Text>
                        <Group align="flex-end" gap="sm" wrap="nowrap">
                          <TextInput
                            className={classes.dirField}
                            label="Backup destination"
                            description={
                              draft.backupDir === null || draft.backupDir.length === 0
                                ? `Default: ${row.server.installDir}\\Backups`
                                : `Effective: ${row.resolvedRoot ?? draft.backupDir}`
                            }
                            value={draft.backupDir ?? ""}
                            placeholder={`${row.server.installDir}\\Backups`}
                            onChange={(event) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  backupDir:
                                    event.currentTarget.value.trim().length > 0
                                      ? event.currentTarget.value
                                      : null,
                                },
                              }))
                            }
                          />
                          <Button
                            variant="default"
                            loading={browsingId === row.server.id}
                            onClick={() => void browseBackupDir(row.server)}
                          >
                            Browse
                          </Button>
                        </Group>
                        <Group align="flex-end" gap="md" wrap="wrap">
                          <Switch
                            label="Enable scheduled world backups"
                            checked={draft.enabled}
                            onChange={(event) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  enabled: event.currentTarget.checked,
                                },
                              }))
                            }
                          />
                          <NumberInput
                            label="Interval (minutes)"
                            description="Min 5 · default 60 · world only"
                            min={5}
                            max={10_080}
                            value={draft.intervalMinutes}
                            onChange={(value) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  intervalMinutes:
                                    typeof value === "number"
                                      ? value
                                      : draft.intervalMinutes,
                                },
                              }))
                            }
                            className={classes.policyField}
                          />
                          <NumberInput
                            label="Keep last world"
                            min={1}
                            max={500}
                            value={draft.retainCountWorld}
                            onChange={(value) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  retainCountWorld:
                                    typeof value === "number"
                                      ? value
                                      : draft.retainCountWorld,
                                },
                              }))
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
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  retainCountPlayers:
                                    typeof value === "number"
                                      ? value
                                      : draft.retainCountPlayers,
                                },
                              }))
                            }
                            className={classes.policyField}
                          />
                          <NumberInput
                            label="Keep last INI"
                            min={1}
                            max={500}
                            value={draft.retainCountIni}
                            onChange={(value) =>
                              setDrafts((previous) => ({
                                ...previous,
                                [row.server.id]: {
                                  ...draft,
                                  retainCountIni:
                                    typeof value === "number"
                                      ? value
                                      : draft.retainCountIni,
                                },
                              }))
                            }
                            className={classes.policyField}
                          />
                          <Button
                            leftSection={<FloppyDisk size={16} />}
                            loading={busy}
                            onClick={() => void savePolicy(row.server.id)}
                          >
                            Save
                          </Button>
                        </Group>
                      </Stack>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </PageScaffold>
  );
}
