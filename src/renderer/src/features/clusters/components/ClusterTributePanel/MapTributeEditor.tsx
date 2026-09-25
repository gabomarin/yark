import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Group, Select, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import type { ServerIniSnapshot, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import { resolveServerRuntime } from "../../createClusterModel";
import { templateApplyIneligibilityReason } from "../../templateApplyModel";
import {
  MAP_TRIBUTE_KEYS,
  readMapTributeValues,
  readTributeValues,
  tributeSettingMeta,
  withMapTributeValues,
  type MapTributeKey,
} from "../../tributeModel";

interface Props {
  opened: boolean;
  members: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  snapshots: Map<string, ServerIniSnapshot>;
  onClose: () => void;
  onSaved: () => void;
}

const LABELS: Record<MapTributeKey, string> = {
  PreventUploadItems: "Prevent item uploads",
  PreventDownloadItems: "Prevent item downloads",
  PreventUploadDinos: "Prevent creature uploads",
  PreventDownloadDinos: "Prevent creature downloads",
  PreventUploadSurvivors: "Prevent survivor uploads",
  PreventDownloadSurvivors: "Prevent survivor downloads",
  noTributeDownloads: "Prevent all Cross-ARK downloads",
  CrossARKAllowForeignDinoDownloads: "Allow non-native creature downloads (Aberration)",
};

interface PendingWrite {
  serverId: string;
  values: Record<MapTributeKey, boolean>;
  keys: MapTributeKey[];
  changedCount: number;
}

function formValues(snapshot: ServerIniSnapshot | undefined): Record<MapTributeKey, boolean> {
  return readMapTributeValues(readTributeValues(snapshot?.payload.gameUserSettings ?? ""));
}

export function MapTributeEditor(props: Props): ReactElement {
  const [serverId, setServerId] = useState(props.members[0]?.id ?? "");
  const [values, setValues] = useState<Record<MapTributeKey, boolean>>(() => formValues(props.snapshots.get(serverId)));
  const [valuesForServer, setValuesForServer] = useState(serverId);
  const [review, setReview] = useState<PendingWrite | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (props.members.length > 0 && !props.members.some((member) => member.id === serverId)) {
      setServerId(props.members[0]!.id);
    }
  }, [props.members, serverId]);

  useEffect(() => {
    const snapshot = props.snapshots.get(serverId);
    if (snapshot !== undefined) {
      setValues(formValues(snapshot));
      setValuesForServer(serverId);
    }
  }, [props.snapshots, serverId]);

  const server = props.members.find((member) => member.id === serverId);
  const snapshot = props.snapshots.get(serverId);
  const displayedValues = valuesForServer === serverId ? values : formValues(snapshot);
  const runtime = server === undefined ? null : resolveServerRuntime(props.statuses, server.id);
  const busyReason = runtime === null ? "Select a cluster member" : templateApplyIneligibilityReason(runtime);

  const prepareReview = async (): Promise<void> => {
    if (server === undefined || busyReason !== null) return;
    setError(null);
    setNotice(null);
    try {
      const latest = await window.api.readServerIni(server.id);
      if (!latest.ok) throw new Error(latest.error ?? "Could not read this server's INI");
      const currentValues = formValues(latest.data);
      const changedKeys = MAP_TRIBUTE_KEYS.filter((key) => displayedValues[key] !== currentValues[key]);
      if (changedKeys.length === 0) {
        setNotice("No per-map tribute settings changed.");
        return;
      }
      const payload = withMapTributeValues(latest.data.payload, displayedValues, changedKeys);
      const preview = await window.api.previewServerIni(server.id, payload);
      if (!preview.ok) throw new Error(preview.error ?? "Could not preview the selected map settings");
      if (!preview.data.valid) throw new Error(preview.data.issues.map((issue) => issue.message).join("; "));
      setReview({
        serverId: server.id,
        values: displayedValues,
        keys: changedKeys,
        changedCount: preview.data.changedCount,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const save = async (): Promise<void> => {
    if (review === null || server === undefined || review.serverId !== server.id || busyReason !== null) return;
    setSaving(true);
    setError(null);
    try {
      const latest = await window.api.readServerIni(server.id);
      if (!latest.ok) throw new Error(latest.error ?? "Could not read this server's INI");
      const payload = withMapTributeValues(latest.data.payload, review.values, review.keys);
      const preview = await window.api.previewServerIni(server.id, payload);
      if (!preview.ok) throw new Error(preview.error ?? "Could not recheck the selected map settings");
      if (!preview.data.valid) throw new Error(preview.data.issues.map((issue) => issue.message).join("; "));
      const result = await window.api.saveServerIni(server.id, payload);
      if (!result.ok) throw new Error(result.error ?? "Could not save the selected map settings");
      setReview(null);
      setNotice(
        result.data.pending
          ? `The server became active; these settings are queued for ${server.name} and will flush after it stops.`
          : `Saved per-map settings for ${server.name}.`,
      );
      props.onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppPanelModal
      opened={props.opened}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      title="Edit per-map tribute settings"
      size="md"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
      footerAlign="between"
      footer={
        <>
          <Button variant="default" disabled={saving} onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={busyReason !== null || snapshot === undefined}
            onClick={() => void prepareReview()}
          >
            Preview & save
          </Button>
        </>
      }
    >
      <Stack gap="xs">
        <Group align="flex-end" grow>
          <Select
            label="Selected map"
            value={serverId || null}
            data={props.members.map((member) => ({ value: member.id, label: `${member.name} · ${member.map}` }))}
            onChange={(value) => {
              if (value !== null) {
                setServerId(value);
                setError(null);
                setNotice(null);
              }
            }}
            disabled={saving}
          />
          <Text size="xs" c={busyReason === null ? "dimmed" : "attention"}>
            {busyReason === null
              ? `Status: ${runtime?.status ?? "unknown"}`
              : `${runtime?.status ?? "unknown"}: ${busyReason}`}
          </Text>
        </Group>

        {error !== null && (
          <Alert color="red" title="Could not save per-map settings">
            {error}
          </Alert>
        )}
        {notice !== null && <Alert color="ok">{notice}</Alert>}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {MAP_TRIBUTE_KEYS.map((key) => (
            <Tooltip key={key} label={tributeSettingMeta(key).description} multiline w={340}>
              <Checkbox
                label={LABELS[key]}
                checked={displayedValues[key]}
                disabled={busyReason !== null || saving}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [key]: event.currentTarget.checked }));
                  setValuesForServer(serverId);
                  setError(null);
                  setNotice(null);
                }}
              />
            </Tooltip>
          ))}
        </SimpleGrid>

        <Text size="xs" c="dimmed">
          Unchecked, missing keys use the catalog's False default and are not written unless you change them.
        </Text>

        {review !== null && (
          <Stack gap="sm">
            <Text size="sm">
              Only <b>{server?.name}</b> will be changed. This map's values are not copied to other cluster members.
            </Text>
            {review.keys.map((key) => (
              <Text key={key} size="sm">
                {LABELS[key]}: {review.values[key] ? "Enabled" : "Disabled"}
              </Text>
            ))}
            <Text size="xs" c="dimmed">
              Preview: {review.changedCount} INI change(s). The server must remain stopped.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setReview(null)}>
                Back
              </Button>
              <Button loading={saving} onClick={() => void save()}>
                Save this map
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </AppPanelModal>
  );
}
