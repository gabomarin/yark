import type { ReactElement } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { formatTargetNames } from "../../copyConfigurationModel";
import type { CopyConfigTargetOutcome } from "./copyConfigurationWizardTypes";

interface Props {
  sourceName: string;
  servers: ServerProfile[];
  outcomes: CopyConfigTargetOutcome[];
  onClose: () => void;
  onCompleted: (targetIds: string[]) => void;
}

export function CopyConfigDoneStep(props: Props): ReactElement {
  const successIds = props.outcomes
    .filter((o) => o.ok)
    .map((o) => o.targetId);
  const failureOutcomes = props.outcomes.filter((o) => !o.ok);

  return (
    <Stack gap="sm">
      {successIds.length > 0 && (
        <Text size="sm">
          Copied settings to {formatTargetNames(props.servers, successIds)}.
          Nothing changed on {props.sourceName}.
        </Text>
      )}
      {failureOutcomes.length > 0 && (
        <Alert color="red" title="Some targets failed">
          <Stack gap={4}>
            {failureOutcomes.map((outcome) => (
              <Text key={outcome.targetId} size="sm">
                {outcome.targetName}: {outcome.error}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {props.outcomes
        .filter((o) => o.ok && o.result?.snapshotDir)
        .map((o) => (
          <Text key={o.targetId} size="sm" c="dimmed">
            Backup for {o.targetName}:{" "}
            <Text span ff="monospace" size="xs">
              {o.result!.snapshotDir}
            </Text>
          </Text>
        ))}
      <Group>
        {successIds.length === 1 && (
          <Button
            onClick={() => {
              props.onCompleted(successIds);
              props.onClose();
            }}
          >
            Open target
          </Button>
        )}
        {successIds.length > 1 && (
          <Button
            onClick={() => {
              props.onCompleted(successIds);
              props.onClose();
            }}
          >
            Close and refresh
          </Button>
        )}
        <Button variant="default" onClick={props.onClose}>
          Close
        </Button>
      </Group>
    </Stack>
  );
}
