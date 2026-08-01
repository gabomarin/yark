import type { ReactElement } from "react";
import {
  CheckCircle,
  HardDrives,
  MagicWand,
  PlugsConnected,
  SkipForward,
} from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { findPortConflicts } from "@shared/port-conflicts";
import type {
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerProfileInput,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import classes from "./ServerOnboardingChecklist.module.css";

interface Props {
  server: ServerProfile;
  servers: ServerProfile[];
  installation: ServerInstallationInfo | null;
  clusterReports: ClusterComplianceReport[];
  onDismiss: () => void;
  onOpenAssistant: () => void;
  onInstallFiles: () => void;
  onServerUpdated: () => void;
}

function toInput(server: ServerProfile): ServerProfileInput {
  return {
    name: server.name,
    map: server.map,
    installDir: server.installDir,
    sessionName: server.sessionName,
    gamePort: server.gamePort,
    queryPort: server.queryPort,
    rconPort: server.rconPort,
    serverPassword: server.serverPassword,
    adminPassword: server.adminPassword,
    clusterId: server.clusterId,
    clusterDir: server.clusterDir,
    extraArgs: server.extraArgs,
    mods: server.mods,
  };
}

export function ServerOnboardingChecklist(props: Props): ReactElement {
  const [experienceDone, setExperienceDone] = useState(false);
  const [savingCluster, setSavingCluster] = useState(false);
  const [savingPorts, setSavingPorts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gamePort, setGamePort] = useState(props.server.gamePort);
  const [queryPort, setQueryPort] = useState(props.server.queryPort);
  const [rconPort, setRconPort] = useState(props.server.rconPort);
  const [clusterChoice, setClusterChoice] = useState<string | null>(
    props.server.clusterId,
  );

  useEffect(() => {
    setGamePort(props.server.gamePort);
    setQueryPort(props.server.queryPort);
    setRconPort(props.server.rconPort);
    setClusterChoice(props.server.clusterId);
  }, [
    props.server.clusterId,
    props.server.gamePort,
    props.server.id,
    props.server.queryPort,
    props.server.rconPort,
    props.server.updatedAt,
  ]);

  const clusterOptions = useMemo(() => {
    const byId = new Map<string, { clusterId: string; clusterDir: string; label: string }>();
    for (const candidate of props.servers) {
      if (candidate.id === props.server.id) continue;
      if (candidate.clusterId === null || candidate.clusterDir === null) continue;
      if (byId.has(candidate.clusterId)) continue;
      byId.set(candidate.clusterId, {
        clusterId: candidate.clusterId,
        clusterDir: candidate.clusterDir,
        label: `${candidate.clusterId} · via ${candidate.name}`,
      });
    }
    return Array.from(byId.values());
  }, [props.server.id, props.servers]);

  const portConflicts = useMemo(() => {
    const others = props.servers.filter((server) => server.id !== props.server.id);
    return findPortConflicts(others, {
      id: props.server.id,
      name: props.server.name,
      gamePort,
      queryPort,
      rconPort,
    });
  }, [gamePort, props.server.id, props.server.name, props.servers, queryPort, rconPort]);

  const clusterReport = useMemo(() => {
    const clusterId = props.server.clusterId;
    if (clusterId === null) return null;
    return props.clusterReports.find((report) => report.clusterId === clusterId) ?? null;
  }, [props.clusterReports, props.server.clusterId]);

  const filesInstalled = props.installation?.installed === true;

  const saveCluster = async (nextClusterId: string | null) => {
    setError(null);
    setSavingCluster(true);
    try {
      const selected =
        nextClusterId === null
          ? null
          : clusterOptions.find((option) => option.clusterId === nextClusterId) ?? null;
      const input: ServerProfileInput = {
        ...toInput(props.server),
        clusterId: selected?.clusterId ?? null,
        clusterDir: selected?.clusterDir ?? null,
      };
      const result = await window.api.updateServer(props.server.id, input);
      if (!result.ok) {
        setError(result.error ?? "Could not update the cluster");
        return;
      }
      setClusterChoice(selected?.clusterId ?? null);
      props.onServerUpdated();
    } finally {
      setSavingCluster(false);
    }
  };

  const savePorts = async () => {
    setError(null); setSavingPorts(true);
    try {
      const result = await window.api.updateServer(props.server.id, {
        ...toInput(props.server),
        gamePort,
        queryPort,
        rconPort,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not save ports");
        return;
      }
      props.onServerUpdated();
    } finally {
      setSavingPorts(false);
    }
  };

  return (
    <div className={classes.root}>
      <header className={classes.header}>
        <div>
          <Text c="dimmed" size="xs" fw={600}>
            {props.server.name} / First steps
          </Text>
          <Title order={2}>Set up launch</Title>
          <Text c="dimmed" size="sm">
            Everything is optional. You can skip and return to the workspace anytime.
          </Text>
        </div>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<SkipForward size={16} />}
          onClick={props.onDismiss}
        >
          Later
        </Button>
      </header>

      <div className={classes.content}>
        {error !== null && (
          <Alert color="red" withCloseButton onClose={() => setError(null)} mb="md">
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <MagicWand size={18} />
              <Title order={4}>Play experience</Title>
              {experienceDone && <CheckCircle size={18} color="var(--mantine-color-green-6)" />}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Tune rates and comfort with the wizard, or leave the INI defaults.
            </Text>
            <Group gap="xs">
              <Button
                size="sm"
                leftSection={<MagicWand size={16} />}
                onClick={() => {
                  setExperienceDone(true);
                  props.onOpenAssistant();
                }}
              >
                Configure with wizard
              </Button>
              <Button
                size="sm"
                variant="light"
                onClick={() => setExperienceDone(true)}
              >
                Use defaults
              </Button>
            </Group>
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <PlugsConnected size={18} />
              <Title order={4}>Cluster</Title>
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Join an existing cluster for cross-map transfers, or continue without a cluster.
            </Text>
            <Select
              label="Cluster"
              placeholder="No cluster"
              clearable
              data={clusterOptions.map((option) => ({
                value: option.clusterId,
                label: option.label,
              }))}
              value={clusterChoice}
              onChange={(value) => {
                void saveCluster(value);
              }}
              disabled={savingCluster}
            />
            {clusterOptions.length === 0 && (
              <Text c="dimmed" size="xs" mt="xs">
                No other servers have a cluster configured yet.
              </Text>
            )}
            {clusterReport !== null && !clusterReport.ok && (
              <Alert color="yellow" title="Cluster warnings" mt="sm">
                <Stack gap={4}>
                  {clusterReport.issues.map((issue) => (
                    <Text key={`${issue.severity}-${issue.message}`} size="sm">
                      {issue.message}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <Title order={4}>Ports</Title>
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Game {props.server.gamePort} · Query {props.server.queryPort} · RCON{" "}
              {props.server.rconPort}. Fix conflicts before installing or starting.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput
                label="Game"
                value={gamePort}
                min={1}
                max={65535}
                allowDecimal={false}
                onChange={(value) => setGamePort(typeof value === "number" ? value : gamePort)}
              />
              <NumberInput
                label="Query"
                value={queryPort}
                min={1}
                max={65535}
                allowDecimal={false}
                onChange={(value) => setQueryPort(typeof value === "number" ? value : queryPort)}
              />
              <NumberInput
                label="RCON"
                value={rconPort}
                min={1}
                max={65535}
                allowDecimal={false}
                onChange={(value) => setRconPort(typeof value === "number" ? value : rconPort)}
              />
            </SimpleGrid>
            {portConflicts.length > 0 ? (
              <Alert color="red" title="Port conflicts" mt="sm">
                <Stack gap={4}>
                  {portConflicts.map((conflict) => (
                    <Text key={`${conflict.port}-${conflict.serverA}-${conflict.serverB}`} size="sm">
                      Port {conflict.port} ({conflict.kind}) between {conflict.serverA} y{" "}
                      {conflict.serverB}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : (
              <Alert color="green" title="No conflicts detected" mt="sm">
                These ports do not conflict with other local profiles.
              </Alert>
            )}
            <Button
              mt="sm"
              size="sm"
              variant="light"
              loading={savingPorts}
              onClick={() => void savePorts()}
            >
              Save ports
            </Button>
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <HardDrives size={18} />
              <Title order={4}>Server files</Title>
              {filesInstalled && <CheckCircle size={18} color="var(--mantine-color-green-6)" />}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              {filesInstalled
                ? "Files are already installed. You can verify or update from the side panel."
                : "Download the binaries with SteamCMD whenever you want. It does not block the rest of the workspace."}
            </Text>
            <Group gap="xs">
              {!filesInstalled && (
                <Button size="sm" onClick={props.onInstallFiles}>
                  Install files
                </Button>
              )}
              <Button size="sm" variant="subtle" onClick={props.onDismiss}>
                Done, go to workspace
              </Button>
            </Group>
          </section>
        </Stack>
      </div>
    </div>
  );
}
