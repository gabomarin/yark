import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import type {
  IniFileKey,
  IniPreview,
  ServerIniPayload,
} from "@shared/types";
import { stripYarkOwnedFromPayload } from "@shared/yark-owned-ini-keys";
import { sanitizeServerIniPayload } from "@features/server-workspace/iniModel";
import { IniFileSegmented } from "@ui/IniFileSegmented/IniFileSegmented";
import { ClusterIniTemplateVisualPanel } from "./ClusterIniTemplateVisualPanel";
import classes from "./ClusterIniTemplateModal.module.css";

interface Props {
  opened: boolean;
  clusterId: string;
  onClose: () => void;
  /** Fired after save or delete so the detail panel can refresh template status. */
  onChanged: () => void;
}

function payloadsEqual(a: ServerIniPayload, b: ServerIniPayload): boolean {
  return a.gameUserSettings === b.gameUserSettings && a.game === b.game;
}

export function ClusterIniTemplateModal(props: Props): ReactElement {
  const [exists, setExists] = useState(false);
  const [payload, setPayload] = useState<ServerIniPayload | null>(null);
  const [baseline, setBaseline] = useState<ServerIniPayload | null>(null);
  const [iniFile, setIniFile] = useState<IniFileKey>("gameUserSettings");
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<IniPreview | null>(null);
  const wasOpenRef = useRef(false);

  const dirty =
    payload !== null && baseline !== null && !payloadsEqual(payload, baseline);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const [stored, draft] = await Promise.all([
        window.api.getClusterIniTemplate(props.clusterId),
        window.api.getClusterIniTemplateOrDraft(props.clusterId),
      ]);
      if (!stored.ok) {
        setError(stored.error ?? "Could not load cluster INI template");
        return;
      }
      if (!draft.ok) {
        setError(draft.error ?? "Could not load cluster INI template draft");
        return;
      }
      setExists(stored.data !== null);
      const next = stripYarkOwnedFromPayload(
        sanitizeServerIniPayload(draft.data.payload),
      );
      setPayload(next);
      setBaseline(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const justOpened = props.opened && !wasOpenRef.current;
    wasOpenRef.current = props.opened;
    if (!props.opened) return;
    if (justOpened) {
      setIniFile("gameUserSettings");
      setMode("visual");
      void load();
    }
  }, [props.opened, props.clusterId]);

  const handleSave = async (): Promise<void> => {
    if (payload === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await window.api.saveClusterIniTemplate(
        props.clusterId,
        payload,
      );
      if (!result.ok) {
        setError(result.error ?? "Could not save cluster INI template");
        return;
      }
      const saved = stripYarkOwnedFromPayload(
        sanitizeServerIniPayload(result.data.template.payload),
      );
      setPayload(saved);
      setBaseline(saved);
      setExists(true);
      setPreview(result.data.preview);
      props.onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (): void => {
    modals.openConfirmModal({
      title: "Delete INI template?",
      children: (
        <Text size="sm">
          Removes the saved template for “{props.clusterId}”. Member server INI
          files on disk are not deleted.
        </Text>
      ),
      labels: { confirm: "Delete template", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          setSaving(true);
          setError(null);
          try {
            const result = await window.api.deleteClusterIniTemplate(
              props.clusterId,
            );
            if (!result.ok) {
              setError(result.error ?? "Could not delete template");
              return;
            }
            props.onChanged();
            props.onClose();
          } finally {
            setSaving(false);
          }
        })();
      },
    });
  };

  const requestClose = (): void => {
    if (dirty) {
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">Unsaved template edits will be lost.</Text>
        ),
        labels: { confirm: "Discard", cancel: "Keep editing" },
        confirmProps: { color: "red" },
        onConfirm: () => props.onClose(),
      });
      return;
    }
    props.onClose();
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!saving) requestClose();
      }}
      title={
        <Group gap="xs" wrap="wrap">
          <Title order={4}>Cluster INI template</Title>
          <Badge variant="light" color="blue" tt="none">
            {props.clusterId}
          </Badge>
          {exists ? (
            <Badge variant="light" color="ok" tt="none">
              Saved
            </Badge>
          ) : (
            <Badge variant="light" color="gray" tt="none">
              None
            </Badge>
          )}
          {dirty && (
            <Badge variant="light" color="attention" tt="none">
              Unsaved
            </Badge>
          )}
        </Group>
      }
      size="90%"
      centered
      closeOnClickOutside={!saving && !dirty}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Shared Game.ini / GameUserSettings.ini for this cluster ID. Session
          name, ports, and passwords stay per-server. ASE-style ActiveMods keys
          are omitted — ASA mods use the Mods panel / -mods= CurseForge IDs.
        </Text>

        {error !== null && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {preview !== null && preview.changedCount > 0 && (
          <Text size="sm" c="dimmed">
            Last save: {preview.changedCount} change
            {preview.changedCount === 1 ? "" : "s"}.
          </Text>
        )}

        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="xs" wrap="wrap">
            <IniFileSegmented
              value={iniFile}
              onChange={setIniFile}
              disabled={loading || saving}
            />
            <SegmentedControl
              size="xs"
              aria-label="INI edit mode"
              value={mode}
              disabled={loading || saving}
              onChange={(value) => setMode(value === "raw" ? "raw" : "visual")}
              data={[
                { label: "Visual", value: "visual" },
                { label: "Text", value: "raw" },
              ]}
            />
          </Group>
        </Group>

        {loading || payload === null ? (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        ) : (
          <ClusterIniTemplateVisualPanel
            payload={payload}
            iniFile={iniFile}
            mode={mode}
            onPayloadChange={setPayload}
          />
        )}

        <div className={classes.notice}>
          Template edits never write member install folders. Apply/seed to
          servers is a separate step.
        </div>

        <Group justify="space-between">
          <Group gap="xs">
            <Button
              variant="default"
              disabled={saving || loading}
              onClick={requestClose}
            >
              Close
            </Button>
            {exists && (
              <Button
                variant="light"
                color="red"
                disabled={saving || loading}
                onClick={handleDelete}
              >
                Delete template
              </Button>
            )}
          </Group>
          <Group gap="xs">
            <Button
              variant="default"
              disabled={saving || loading || !dirty}
              onClick={() => void load()}
            >
              Reload
            </Button>
            <Button
              leftSection={<FloppyDisk size={16} />}
              loading={saving}
              disabled={loading || payload === null || (exists && !dirty)}
              onClick={() => void handleSave()}
            >
              {exists ? "Save template" : "Create template"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
