import type { ReactElement } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Checkbox,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import type { ConfigTransferPreview } from "@shared/types";
import { ClusterIniDiffSummary } from "@features/clusters/components/ClusterIniDiffSummary/ClusterIniDiffSummary";

interface Props {
  previews: ConfigTransferPreview[];
  passwordsSelected: boolean;
  confirmed: boolean;
  passwordConfirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  onPasswordConfirmedChange: (value: boolean) => void;
}

function PreviewBody(props: {
  preview: ConfigTransferPreview;
  showTargetHeading: boolean;
}): ReactElement {
  const { preview } = props;
  return (
    <Stack gap="sm">
      {props.showTargetHeading && (
        <Group gap="xs">
          <Badge variant="light" color="blue">
            {preview.sourceName} → {preview.targetName}
          </Badge>
          <Badge variant="light" color="teal">
            {preview.iniPreview.changedCount} INI changes
          </Badge>
        </Group>
      )}

      {preview.warnings.map((warning) => (
        <Alert key={`${preview.targetId}:${warning}`} color="attention">
          {warning}
        </Alert>
      ))}

      <ClusterIniDiffSummary
        preview={preview.iniPreview}
        secretNote="Ports, session name, and passwords stay on the target unless you opted in."
      />

      {preview.profileDiff.mods !== null && (
        <Text size="sm">
          Mods: {preview.profileDiff.mods.before.length} →{" "}
          {preview.profileDiff.mods.after.length}
        </Text>
      )}
      {preview.profileDiff.extraArgs !== null && (
        <Text size="sm">
          Extra args: {preview.profileDiff.extraArgs.before.length} →{" "}
          {preview.profileDiff.extraArgs.after.length}
        </Text>
      )}
      {preview.profileDiff.structuredLaunchArgs !== null && (
        <Text size="sm">
          Structured launch:{" "}
          {preview.profileDiff.structuredLaunchArgs.before.length} →{" "}
          {preview.profileDiff.structuredLaunchArgs.after.length}
        </Text>
      )}
      {preview.profileDiff.backupPolicy !== null && (
        <Text size="sm">Backup schedule will be updated.</Text>
      )}
      {preview.profileDiff.passwords !== null && (
        <Text size="sm" style={{ color: "var(--app-color-fossil)" }}>
          Passwords will be copied (hidden here).
        </Text>
      )}
    </Stack>
  );
}

export function CopyConfigPreviewStep(props: Props): ReactElement {
  const { previews } = props;
  const multi = previews.length > 1;
  const totalIniChanges = previews.reduce(
    (sum, p) => sum + p.iniPreview.changedCount,
    0,
  );
  const allValid = previews.every((p) => p.iniPreview.valid);
  const targetLabel =
    previews.length === 1
      ? `“${previews[0]!.targetName}”`
      : `${previews.length} servers`;

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light" color="blue">
          {previews[0]?.sourceName ?? "…"} →{" "}
          {multi ? `${previews.length} targets` : (previews[0]?.targetName ?? "…")}
        </Badge>
        <Badge variant="light" color="teal">
          {totalIniChanges} INI changes
          {multi ? " total" : ""}
        </Badge>
      </Group>

      {!allValid && (
        <Alert color="red">
          One or more targets have an invalid INI preview. Fix the source
          selection or regenerate the preview.
        </Alert>
      )}

      {multi ? (
        <Accordion variant="separated" defaultValue={previews[0]?.targetId}>
          {previews.map((preview) => (
            <Accordion.Item key={preview.targetId} value={preview.targetId}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {preview.targetName}
                  </Text>
                  <Badge size="xs" variant="light" color="teal">
                    {preview.iniPreview.changedCount} changes
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <PreviewBody preview={preview} showTargetHeading={false} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      ) : previews[0] !== undefined ? (
        <PreviewBody preview={previews[0]} showTargetHeading={true} />
      ) : null}

      <Checkbox
        checked={props.confirmed}
        onChange={(e) => props.onConfirmedChange(e.currentTarget.checked)}
        label={`Overwrite selected settings on ${targetLabel}. A backup is created first. Servers will not start.`}
      />
      {props.passwordsSelected && (
        <Checkbox
          checked={props.passwordConfirmed}
          onChange={(e) =>
            props.onPasswordConfirmedChange(e.currentTarget.checked)
          }
          label="Also copy passwords from the source."
          styles={{
            label: { color: "var(--app-color-fossil)" },
          }}
        />
      )}
    </Stack>
  );
}
