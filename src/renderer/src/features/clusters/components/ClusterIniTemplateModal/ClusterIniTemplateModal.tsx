import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import type {
  IniFileKey,
  IniPreview,
  ServerIniPayload,
} from "@shared/types";
import { isYarkOwnedIniKey, stripYarkOwnedFromPayload } from "@shared/yark-owned-ini-keys";
import {
  parseIniRows,
  sanitizeServerIniPayload,
  setIniValue,
  textForFile,
  withFileText,
} from "@features/server-workspace/iniModel";

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

  const activeText = payload !== null ? textForFile(payload, iniFile) : "";
  const visualRows = useMemo(() => {
    if (iniFile !== "gameUserSettings") {
      return parseIniRows(activeText);
    }
    return parseIniRows(activeText).filter(
      (row) => !isYarkOwnedIniKey(row.section, row.key),
    );
  }, [activeText, iniFile]);

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

  const updateRaw = (text: string): void => {
    if (payload === null) return;
    setPayload(withFileText(payload, iniFile, text));
  };

  const updateVisualValue = (section: string, key: string, value: string): void => {
    if (payload === null) return;
    if (iniFile === "gameUserSettings" && isYarkOwnedIniKey(section, key)) {
      return;
    }
    setPayload(
      withFileText(payload, iniFile, setIniValue(activeText, section, key, value)),
    );
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      title={`Cluster INI template — ${props.clusterId}`}
      size="xl"
      centered
      closeOnClickOutside={!saving && !dirty}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Alert color="blue" variant="light">
          Shared Game.ini / GameUserSettings.ini for this cluster ID. Session
          name, ports, and passwords stay per-server. ASE-style ActiveMods keys
          are omitted — ASA mods use the Mods panel / -mods= CurseForge IDs.
        </Alert>

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

        <Group justify="space-between" wrap="wrap">
          <SegmentedControl
            value={iniFile}
            onChange={(value) => setIniFile(value as IniFileKey)}
            data={[
              { label: "GameUserSettings.ini", value: "gameUserSettings" },
              { label: "Game.ini", value: "game" },
            ]}
          />
          <SegmentedControl
            value={mode}
            onChange={(value) => setMode(value as "visual" | "raw")}
            data={[
              { label: "Visual", value: "visual" },
              { label: "Raw", value: "raw" },
            ]}
          />
        </Group>

        {loading || payload === null ? (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        ) : mode === "raw" ? (
          <Textarea
            aria-label={`${iniFile} raw editor`}
            value={activeText}
            onChange={(event) => updateRaw(event.currentTarget.value)}
            minRows={16}
            autosize
            maxRows={28}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
          />
        ) : visualRows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No editable keys in this file yet. Switch to Raw to paste content, or
            save defaults and edit further.
          </Text>
        ) : (
          <Stack gap="xs" style={{ maxHeight: 420, overflow: "auto" }}>
            {visualRows.slice(0, 80).map((row, index) => (
              <Group key={`${row.section}-${row.key}-${index}`} align="flex-start" wrap="nowrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {row.key}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {row.section}
                  </Text>
                </div>
                <Textarea
                  aria-label={`${row.section} ${row.key}`}
                  value={row.value}
                  onChange={(event) =>
                    updateVisualValue(row.section, row.key, event.currentTarget.value)
                  }
                  autosize
                  minRows={1}
                  maxRows={4}
                  style={{ width: 280 }}
                />
              </Group>
            ))}
            {visualRows.length > 80 && (
              <Text size="xs" c="dimmed">
                Showing first 80 keys — use Raw for the full file.
              </Text>
            )}
          </Stack>
        )}

        <Group justify="space-between">
          <Group gap="xs">
            <Button
              variant="default"
              disabled={saving || loading}
              onClick={() => {
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
              }}
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
