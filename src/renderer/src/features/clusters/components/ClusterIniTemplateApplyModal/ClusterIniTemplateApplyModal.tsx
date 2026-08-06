import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import type {
  ClusterIniTemplateApplyOperation,
  ClusterIniTemplateMemberPreview,
} from "@shared/types";
import { ClusterIniDiffSummary } from "../ClusterIniDiffSummary/ClusterIniDiffSummary";

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
  checkbox: string;
  secretNote: string;
} {
  if (operation === "promote") {
    return {
      title: "Promote member to template",
      body: `Copy the current INI files from “${serverName}” into the cluster template. Session name, ports, and passwords are stripped — they stay per-server. Member install files are not changed.`,
      confirmLabel: "Promote to template",
      checkbox:
        "Replace the existing cluster template with this member’s shared settings.",
      secretNote: "Owned keys never enter the template",
    };
  }
  return {
    title: "Restore member from template",
    body: `Replace Game.ini and GameUserSettings.ini on “${serverName}” with the cluster template. Ports, passwords, and session name stay owned by this profile after composition.`,
    confirmLabel: "Restore & backup",
    checkbox:
      "I understand this overwrites the member’s current INI files after a recoverable backup.",
    secretNote:
      "YARK-owned secrets are recomposed from the profile and redacted in the preview",
  };
}

export function ClusterIniTemplateApplyModal(props: Props): ReactElement {
  const copy = operationCopy(props.operation, props.serverName);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClusterIniTemplateMemberPreview | null>(
    null,
  );

  useEffect(() => {
    if (!props.opened) return;
    let cancelled = false;
    setLoading(true);
    setCommitting(false);
    setConfirmed(false);
    setError(null);
    setPreview(null);

    void (async () => {
      try {
        const result =
          props.operation === "promote"
            ? await window.api.previewClusterIniPromote(
                props.clusterId,
                props.serverId,
              )
            : await window.api.previewClusterIniRestore(
                props.clusterId,
                props.serverId,
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
  }, [props.opened, props.clusterId, props.serverId, props.operation]);

  const canCommit =
    confirmed &&
    preview !== null &&
    preview.preview.valid &&
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
            )
          : await window.api.restoreClusterIniFromTemplate(
              props.clusterId,
              props.serverId,
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

        {preview !== null && preview.preview.valid && (
          <Group gap="xs" wrap="wrap">
            {props.operation === "restore" ? (
              <Badge size="sm" variant="light" color="teal" tt="none">
                Backup before write
              </Badge>
            ) : (
              <Badge size="sm" variant="light" color="attention" tt="none">
                Replaces saved template
              </Badge>
            )}
            <Badge size="sm" variant="light" color="blue" tt="none">
              {changeCount} preview change{changeCount === 1 ? "" : "s"}
            </Badge>
            {props.operation === "restore" ? (
              <Badge size="sm" variant="default" tt="none">
                Server must be stopped
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

        <Checkbox
          checked={confirmed}
          disabled={loading || committing || preview === null}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          label={copy.checkbox}
        />

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
