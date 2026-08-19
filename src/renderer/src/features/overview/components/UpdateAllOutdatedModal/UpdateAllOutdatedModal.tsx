import type { ReactElement } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { DownloadSimple } from "@phosphor-icons/react";
import type { UpdateAllOutdatedPlan } from "../../updateAllOutdatedModel";
import classes from "./UpdateAllOutdatedModal.module.css";

interface Props {
  opened: boolean;
  loading?: boolean;
  queueing?: boolean;
  plan: UpdateAllOutdatedPlan | null;
  onClose: () => void;
  onConfirm: () => void;
}

function buildLabel(serverName: string): string {
  return `${serverName} build row`;
}

export function UpdateAllOutdatedModal(props: Props): ReactElement {
  const plan = props.plan;
  const queueing = props.queueing === true;
  const eligibleCount = plan?.eligible.length ?? 0;
  const skippedCount = plan?.skipped.length ?? 0;

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      withCloseButton={!queueing}
      closeOnClickOutside={!queueing}
      closeOnEscape={!queueing}
      title="Update All"
      size="lg"
      centered
    >
      <Stack gap="md">
        {props.loading ? (
          <Text size="sm" c="dimmed">
            Checking Steam builds…
          </Text>
        ) : plan === null ? (
          <Text size="sm" c="dimmed">
            Could not load update status.
          </Text>
        ) : plan.rows.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<DownloadSimple size={20} />}
            title="No outdated servers"
            description="Every installed server is already on the latest Steam build."
          />
        ) : (
          <>
            <Text size="sm" c="dimmed">
              One Update job per eligible server is added to Downloads.
              Running servers and active Downloads stay skipped until they
              are stopped or the queue is cleared.
            </Text>
            {plan.officialBuild !== null ? (
              <Text size="xs" c="dimmed">
                Latest Steam build: {plan.officialBuild}
              </Text>
            ) : null}
            {eligibleCount > 0 ? (
              <Alert
                color="blue"
                title={`${eligibleCount} server${eligibleCount === 1 ? "" : "s"} ready to queue`}
              >
                Confirm queues one Update job per server. Downloads runs
                jobs one at a time with the usual safe backup/rollback.
              </Alert>
            ) : (
              <Alert color="yellow" title="Nothing ready to queue">
                All outdated servers are currently skipped. Stop running
                servers or clear Downloads jobs, then try again.
              </Alert>
            )}
            <div className={classes.listScroll}>
              <Stack gap="xs" className={classes.list}>
                {plan.rows.map((row) => (
                  <div
                    key={row.serverId}
                    className={classes.row}
                    aria-label={buildLabel(row.serverName)}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2} className={classes.copy}>
                        <Text size="sm" fw={600}>
                          {row.serverName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {row.installBuild ?? "Unknown install build"}
                          {row.officialBuild !== null
                            ? ` → ${row.officialBuild}`
                            : ""}
                        </Text>
                        {row.skipLabel !== null ? (
                          <Text size="xs" c="dimmed">
                            {row.skipLabel}
                          </Text>
                        ) : null}
                      </Stack>
                      {!row.eligible ? (
                        <Badge size="sm" variant="light" color="gray">
                          Skip
                        </Badge>
                      ) : null}
                    </Group>
                  </div>
                ))}
              </Stack>
            </div>
            {skippedCount > 0 ? (
              <Text size="xs" c="dimmed">
                {skippedCount} server{skippedCount === 1 ? "" : "s"} skipped.
              </Text>
            ) : null}
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose} disabled={props.queueing}>
            Cancel
          </Button>
          <Button
            onClick={props.onConfirm}
            loading={props.queueing}
            disabled={
              props.loading || plan === null || eligibleCount === 0 || props.queueing
            }
          >
            Accept
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
