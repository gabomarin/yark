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

export function ServerOnboardingChecklist(props: Props): JSX.Element {
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
        label: `${candidate.clusterId} · vía ${candidate.name}`,
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
    setSavingCluster(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo actualizar el cluster");
      return;
    }
    setClusterChoice(selected?.clusterId ?? null);
    props.onServerUpdated();
  };

  const savePorts = async () => {
    setError(null);
    setSavingPorts(true);
    const result = await window.api.updateServer(props.server.id, {
      ...toInput(props.server),
      gamePort,
      queryPort,
      rconPort,
    });
    setSavingPorts(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudieron guardar los puertos");
      return;
    }
    props.onServerUpdated();
  };

  return (
    <div className={classes.root}>
      <header className={classes.header}>
        <div>
          <Text c="dimmed" size="xs" fw={600}>
            {props.server.name} / Primeros pasos
          </Text>
          <Title order={2}>Configura el arranque</Title>
          <Text c="dimmed" size="sm">
            Todo es opcional. Puedes saltar y volver al workspace cuando quieras.
          </Text>
        </div>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<SkipForward size={16} />}
          onClick={props.onDismiss}
        >
          Más tarde
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
              <Title order={4}>Experiencia de juego</Title>
              {experienceDone && <CheckCircle size={18} color="var(--mantine-color-green-6)" />}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Ajusta tasas y comodidad con el asistente, o deja los defaults del INI.
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
                Configurar con asistente
              </Button>
              <Button
                size="sm"
                variant="light"
                onClick={() => setExperienceDone(true)}
              >
                Usar defaults
              </Button>
            </Group>
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <PlugsConnected size={18} />
              <Title order={4}>Cluster</Title>
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Únete a un cluster existente para transferencias entre mapas, o continúa sin cluster.
            </Text>
            <Select
              label="Cluster"
              placeholder="Sin cluster"
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
                No hay otros servidores con cluster configurado todavía.
              </Text>
            )}
            {clusterReport !== null && !clusterReport.ok && (
              <Alert color="yellow" title="Avisos del cluster" mt="sm">
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
              <Title order={4}>Puertos</Title>
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Game {props.server.gamePort} · Query {props.server.queryPort} · RCON{" "}
              {props.server.rconPort}. Corrige conflictos antes de instalar o arrancar.
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
              <Alert color="red" title="Conflictos de puerto" mt="sm">
                <Stack gap={4}>
                  {portConflicts.map((conflict) => (
                    <Text key={`${conflict.port}-${conflict.serverA}-${conflict.serverB}`} size="sm">
                      Puerto {conflict.port} ({conflict.kind}) entre {conflict.serverA} y{" "}
                      {conflict.serverB}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : (
              <Alert color="green" title="Sin conflictos detectados" mt="sm">
                Estos puertos no chocan con otros perfiles locales.
              </Alert>
            )}
            <Button
              mt="sm"
              size="sm"
              variant="light"
              loading={savingPorts}
              onClick={() => void savePorts()}
            >
              Guardar puertos
            </Button>
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <HardDrives size={18} />
              <Title order={4}>Archivos del servidor</Title>
              {filesInstalled && <CheckCircle size={18} color="var(--mantine-color-green-6)" />}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              {filesInstalled
                ? "Los archivos ya están instalados. Puedes verificar o actualizar desde el panel lateral."
                : "Descarga los binarios con SteamCMD cuando quieras. No bloquea el resto del workspace."}
            </Text>
            <Group gap="xs">
              {!filesInstalled && (
                <Button size="sm" onClick={props.onInstallFiles}>
                  Instalar archivos
                </Button>
              )}
              <Button size="sm" variant="subtle" onClick={props.onDismiss}>
                Listo, ir al workspace
              </Button>
            </Group>
          </section>
        </Stack>
      </div>
    </div>
  );
}
