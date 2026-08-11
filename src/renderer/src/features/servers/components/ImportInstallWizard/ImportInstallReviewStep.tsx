import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { isMetadataServiceNotConfiguredMessage } from "@shared/curseforge-proxy-url";
import type { ImportInstallProbe, ModMetadata } from "@shared/types";

interface Props {
  probe: ImportInstallProbe;
  modsOpen: boolean;
  onModsOpenChange: (open: boolean) => void;
  /** Filled CurseForge rows keyed by Project ID (parent owns persist). */
  modMetadata: Record<string, ModMetadata>;
  onModMetadataChange: (next: Record<string, ModMetadata>) => void;
}

export function ImportInstallReviewStep(props: Props): ReactElement {
  const { probe } = props;
  const modIds = probe.suggestions.mods;
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaWarning, setMetaWarning] = useState<string | null>(null);
  const [fetchAttemptedKey, setFetchAttemptedKey] = useState<string | null>(null);

  const missingIds = useMemo(
    () => modIds.filter((id) => props.modMetadata[id] === undefined),
    [modIds, props.modMetadata],
  );
  const missingKey = missingIds.join(",");

  useEffect(() => {
    setFetchAttemptedKey(null);
  }, [modIds.join(",")]);

  useEffect(() => {
    if (missingIds.length === 0) {
      setLoadingMeta(false);
      setMetaWarning(null);
      return;
    }
    if (fetchAttemptedKey === missingKey) {
      return;
    }
    let alive = true;
    setLoadingMeta(true);
    setMetaWarning(null);
    const ids = [...missingIds];
    void window.api.getModsMetadata(ids).then((result) => {
      if (!alive) return;
      setLoadingMeta(false);
      setFetchAttemptedKey(missingKey);
      if (!result.ok) {
        if (isMetadataServiceNotConfiguredMessage(result.error)) {
          setMetaWarning(result.error);
          return;
        }
        setMetaWarning(result.error ?? "Could not load mod names from CurseForge");
        return;
      }
      if (result.data.length === 0) {
        setMetaWarning("CurseForge returned no names for these Project IDs yet.");
        return;
      }
      const unresolved = ids.length - result.data.length;
      if (unresolved > 0) {
        setMetaWarning(
          `Named ${result.data.length}/${ids.length} mods; ${unresolved} still show Project ID only.`,
        );
      }
      props.onModMetadataChange(
        Object.fromEntries(result.data.map((row) => [row.id, row])),
      );
    });
    return () => {
      alive = false;
    };
  }, [missingKey, fetchAttemptedKey]);

  return (
    <Stack gap="sm">
      <Alert color="yellow" title="Profile only">
        Schedules, clusters, and other managers&apos; databases are not imported.
        Game.ini / GameUserSettings.ini on disk are left unchanged until you Start
        (or edit and save) this profile.
      </Alert>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {[
          ["Profile name", probe.suggestions.name],
          ["Session name", probe.suggestions.sessionName],
          ["Map", probe.suggestions.map],
          [
            "Ports",
            `${probe.suggestions.gamePort} / ${probe.suggestions.queryPort} / ${probe.suggestions.rconPort}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {label}
            </Text>
            <Text size="sm">{value}</Text>
          </div>
        ))}
      </SimpleGrid>
      <div>
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <Text size="sm" fw={600}>
                Found {modIds.length} mods
              </Text>
              {loadingMeta && <Loader size="xs" />}
            </Group>
            <Text size="xs" c="dimmed">
              Enable them manually later on the Mods tab.
            </Text>
          </div>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => props.onModsOpenChange(!props.modsOpen)}
            disabled={modIds.length === 0}
          >
            {props.modsOpen ? "Hide list" : "Show list"}
          </Button>
        </Group>
        {metaWarning !== null && (
          <Text size="xs" c="dimmed" mt={4}>
            {metaWarning}
          </Text>
        )}
        <Collapse expanded={props.modsOpen && modIds.length > 0}>
          <ScrollArea.Autosize mah={220} mt="xs" type="scroll" offsetScrollbars>
            <Stack gap={4}>
              {modIds.map((id) => {
                const name = props.modMetadata[id]?.name?.trim();
                return (
                  <Group key={id} justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                      {name && name.length > 0 ? name : `Project ${id}`}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {id}
                    </Text>
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Collapse>
      </div>
    </Stack>
  );
}
