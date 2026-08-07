import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
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
import { IniEditorNav } from "@ui/IniEditorNav/IniEditorNav";
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

  const dirty =
    payload !== null && baseline !== null && !payloadsEqual(payload, baseline);

  const applyLoadedTemplate = (
    stored: Awaited<ReturnType<typeof window.api.getClusterIniTemplate>>,
    draft: Awaited<ReturnType<typeof window.api.getClusterIniTemplateOrDraft>>,
  ): void => {
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
  };

  const reloadTemplate = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const [stored, draft] = await Promise.all([
        window.api.getClusterIniTemplate(props.clusterId),
        window.api.getClusterIniTemplateOrDraft(props.clusterId),
      ]);
      applyLoadedTemplate(stored, draft);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const clusterId = props.clusterId;

    setLoading(true);
    setError(null);
    setPreview(null);

    void (async () => {
      try {
        const [stored, draft] = await Promise.all([
          window.api.getClusterIniTemplate(clusterId),
          window.api.getClusterIniTemplateOrDraft(clusterId),
        ]);
        if (cancelled) return;
        applyLoadedTemplate(stored, draft);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.clusterId]);

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
      classNames={{
        content: classes.modalContent,
        header: classes.modalHeader,
        body: classes.modalBody,
      }}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          height: "min(92vh, 860px)",
          maxHeight: "min(92vh, 860px)",
          overflow: "hidden",
        },
        header: {
          flexShrink: 0,
        },
        body: {
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <div className={classes.shell} data-cluster-ini-shell>
        <div className={classes.top}>
          <Text size="sm" c="dimmed">
            Shared Game.ini / GameUserSettings.ini for this cluster ID. Session
            name, ports, and passwords stay per-server.
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

          <div className={classes.navRow}>
            <IniEditorNav
              file={iniFile}
              onFileChange={setIniFile}
              mode={mode}
              onModeChange={(value) => setMode(value === "raw" ? "raw" : "visual")}
              modeOptions={[
                { label: "Visual", value: "visual" },
                { label: "Text", value: "raw" },
              ]}
              disabled={loading || saving}
            />
          </div>
        </div>

        <div className={classes.editorRegion} data-cluster-ini-editor>
          {loading || payload === null ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : (
            <ClusterIniTemplateVisualPanel
              key={`${iniFile}:${mode}`}
              payload={payload}
              iniFile={iniFile}
              mode={mode}
              onPayloadChange={setPayload}
            />
          )}
        </div>

        <div className={classes.footer} data-cluster-ini-footer>
          <div className={classes.notice}>
            Template edits never write member install folders. Use Promote /
            Restore on a stopped member, or opt into seed when adding servers.
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
                onClick={() => void reloadTemplate()}
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
        </div>
      </div>
    </Modal>
  );
}
