import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  clusterIniFileSelectionHasWork,
  defaultClusterIniFileSelection,
} from "@shared/cluster-ini-file-selection";
import type {
  ClusterIniTemplateApplyOperation,
  ClusterIniTemplateFileSelection,
  ClusterIniTemplateMemberPreview,
} from "@shared/types";
import { ClusterIniDiffSummary } from "../ClusterIniDiffSummary/ClusterIniDiffSummary";
import { ClusterIniFileSelectionFields } from "../ClusterIniFileSelectionFields/ClusterIniFileSelectionFields";

interface Props {
  opened: boolean;
  clusterId: string;
  serverId: string;
  serverName: string;
  operation: Extract<ClusterIniTemplateApplyOperation, "restore" | "promote">;
  onClose: () => void;
  onApplied: () => void;
}

function operationCopy(
  operation: Props["operation"],
  serverName: string,
): {
  title: string;
  body: string;
  confirmLabel: string;
  secretNote: string;
  filesDescription: string;
} {
  if (operation === "promote") {
    return {
      title: "Promote member to template",
      body: `Copy selected INI files from “${serverName}” into the cluster template. Session name, ports, and passwords are stripped – they stay per-server. Member install files are not changed.`,
      confirmLabel: "Promote to template",
      secretNote: "Owned keys never enter the template",
      filesDescription:
        "Choose which template files to update. Unchecked files keep the current template text.",
    };
  }
  return {
    title: "Restore member from template",
    body: `Replace selected INI files on “${serverName}” with the cluster template. Ports, passwords, and session name stay owned by this profile after composition.`,
    confirmLabel: "Restore & backup",
    secretNote:
      "Ports, passwords, and session stay on this profile and are omitted from the preview",
    filesDescription:
      "Choose which member files to overwrite. Unchecked files stay as they are on disk.",
  };
}

export function ClusterIniTemplateApplyModal(props: Props): ReactElement {
  const copy = operationCopy(props.operation, props.serverName);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ClusterIniTemplateFileSelection>(
    () => defaultClusterIniFileSelection(),
  );
  const [preview, setPreview] = useState<ClusterIniTemplateMemberPreview | null>(
    null,
  );

  useEffect(() => {
    if (!props.opened) return;
    if (!clusterIniFileSelectionHasWork(files)) {
      setPreview(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setCommitting(false);
    setError(null);
    setPreview(null);

    void (async () => {
      try {
        const result =
          props.operation === "promote"
            ? await window.api.previewClusterIniPromote(
                props.clusterId,
                props.serverId,
                files,
              )
            : await window.api.previewClusterIniRestore(
                props.clusterId,
                props.serverId,
                files,
              );
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? "Could not build template preview");
          return;
        }
        setPreview(result.data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.opened, props.clusterId, props.serverId, props.operation, files]);

  const canCommit =
    preview !== null &&
    preview.preview.valid &&
    clusterIniFileSelectionHasWork(files) &&
    !loading &&
    !committing;

  const handleCommit = async (): Promise<void> => {
    if (!canCommit) return;
    setCommitting(true);
    setError(null);
    try {
      const result =
        props.operation === "promote"
          ? await window.api.promoteClusterIniToTemplate(
              props.clusterId,
              props.serverId,
              files,
            )
          : await window.api.restoreClusterIniFromTemplate(
              props.clusterId,
              props.serverId,
              files,
            );
      if (!result.ok) {
        setError(result.error ?? "Template operation failed");
        return;
      }
      props.onApplied();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  };

  const changeCount = preview?.preview.changedCount ?? 0;

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!committing) props.onClose();
      }}
      title={
        <Group gap="xs" wrap="wrap">
          <Text fw={600}>{copy.title}</Text>
          <Badge variant="light" color="blue" tt="none">
            {props.clusterId}
          </Badge>
        </Group>
      }
      size="xl"
      centered
      closeOnClickOutside={!committing}
      closeOnEscape={!committing}
      withCloseButton={!committing}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {copy.body}
        </Text>

        <ClusterIniFileSelectionFields
          value={files}
          disabled={committing}
          description={copy.filesDescription}
          onChange={setFiles}
        />

        {preview !== null && preview.preview.valid && (
          <Group gap="xs" wrap="wrap">
            {props.operation === "restore" ? (
              <Badge size="sm" variant="light" color="teal" tt="none">
                Backup before write
              </Badge>
            ) : (
              <Badge
                size="sm"
                variant="light"
                tt="none"
                styles={{
                  root: {
                    color: "var(--app-color-fossil)",
                    background:
                      "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
                  },
                }}
              >
                Replaces saved template
              </Badge>
            )}
            <Badge size="sm" variant="light" color="blue" tt="none">
              {changeCount} preview change{changeCount === 1 ? "" : "s"}
            </Badge>
            {props.operation === "restore" ? (
              <Badge size="sm" variant="default" tt="none">
                Server must not be running
              </Badge>
            ) : (
              <Badge size="sm" variant="default" tt="none">
                Member files unchanged
              </Badge>
            )}
          </Group>
        )}

        {error !== null && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {loading && (
          <Text size="sm" c="dimmed">
            Building preview…
          </Text>
        )}

        {preview !== null && (
          <ClusterIniDiffSummary
            preview={preview.preview}
            secretNote={copy.secretNote}
          />
        )}

        <Group justify="space-between">
          <Button
            variant="default"
            disabled={committing}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          <Button
            loading={committing}
            disabled={!canCommit}
            onClick={() => void handleCommit()}
          >
            {copy.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
