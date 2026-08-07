import type { ReactElement } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo, ServerStatus } from "@shared/types";
import {
  isTargetEligible,
  runtimeStatus,
  statusLabel,
  targetListSelectionState,
  toggleAllTargetIds,
  toggleTargetId,
} from "../../copyConfigurationModel";
import classes from "./CopyConfigTargetList.module.css";

interface Props {
  sourceName: string;
  sourceStatus: ServerStatus;
  sourceMap: string;
  sourceClusterId: string | null;
  targetIds: string[];
  targetOptions: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  neverOpen: boolean;
  onTargetIdsChange: (ids: string[]) => void;
  onToggleNeverOpen: () => void;
}

export function CopyConfigSourceTargetStep(props: Props): ReactElement {
  const eligibleIds = props.targetOptions
    .filter((server) =>
      isTargetEligible(runtimeStatus(props.statuses, server.id)),
    )
    .map((server) => server.id);
  const listState = targetListSelectionState(props.targetIds, eligibleIds);
  const ineligibleSelected = props.targetIds.filter((id) => {
    const status = runtimeStatus(props.statuses, id);
    return !isTargetEligible(status);
  });

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <Text size="sm" fw={500}>
          From {props.sourceName}
        </Text>
        <Badge variant="light">{statusLabel(props.sourceStatus)}</Badge>
        <Text size="xs" c="dimmed">
          {props.sourceMap}
          {props.sourceClusterId ? ` · ${props.sourceClusterId}` : ""}
        </Text>
      </Group>
      {props.sourceStatus !== "stopped" && (
        <Alert color="attention">
          Source is running — we copy saved settings, not live game memory.
        </Alert>
      )}

      <div
        className={classes.root}
        data-enabled={listState.selectedCount > 0 || undefined}
      >
        <Checkbox
          label="Copy to (targets)"
          description="Select one or more stopped servers"
          checked={listState.checked}
          indeterminate={listState.indeterminate}
          disabled={eligibleIds.length === 0}
          onChange={(e) =>
            props.onTargetIdsChange(
              toggleAllTargetIds(
                props.targetIds,
                eligibleIds,
                e.currentTarget.checked,
              ),
            )
          }
        />

        <div className={classes.body}>
          <Group gap="xs" mb="xs">
            <Text size="xs" c="dimmed">
              {listState.selectedCount} selected
            </Text>
          </Group>

          {props.targetOptions.length === 0 ? (
            <Text size="xs" c="dimmed">
              No other servers available as targets.
            </Text>
          ) : (
            <ScrollArea.Autosize
              mah={280}
              type="auto"
              offsetScrollbars
              className={classes.listScroll}
            >
              <ul className={classes.list}>
                {props.targetOptions.map((server) => {
                  const status = runtimeStatus(props.statuses, server.id);
                  const eligible = isTargetEligible(status);
                  const checked = props.targetIds.includes(server.id);
                  return (
                    <li key={server.id} className={classes.row}>
                      <Checkbox
                        checked={checked}
                        disabled={!eligible && !checked}
                        onChange={(e) =>
                          props.onTargetIdsChange(
                            toggleTargetId(
                              props.targetIds,
                              server.id,
                              e.currentTarget.checked,
                            ),
                          )
                        }
                        label={
                          <Group gap={8} wrap="nowrap">
                            <Text size="sm">{server.name}</Text>
                            <Badge
                              size="xs"
                              variant="light"
                              color={eligible ? undefined : "red"}
                            >
                              {statusLabel(status)}
                            </Badge>
                            {!server.enabled && (
                              <Badge size="xs" color="gray" variant="outline">
                                Disabled
                              </Badge>
                            )}
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {server.map}
                              {server.clusterId ? ` · ${server.clusterId}` : ""}
                            </Text>
                          </Group>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </ScrollArea.Autosize>
          )}
        </div>
      </div>

      {ineligibleSelected.length > 0 && (
        <Alert color="red">
          Stop{" "}
          {ineligibleSelected
            .map(
              (id) =>
                props.targetOptions.find((s) => s.id === id)?.name ?? id,
            )
            .join(", ")}{" "}
          before continuing.
        </Alert>
      )}

      <div>
        <Button
          variant="subtle"
          size="compact-xs"
          onClick={props.onToggleNeverOpen}
        >
          {props.neverOpen ? "Hide" : "What stays on the target?"}
        </Button>
        {props.neverOpen && (
          <Text size="xs" c="dimmed" mt="xs">
            Name, folder, map, ports, cluster, and world saves are never copied.
          </Text>
        )}
      </div>
    </Stack>
  );
}
