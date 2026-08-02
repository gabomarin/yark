import { Alert, Button, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  humanizeHostPortProbeError,
  isHostPortBusyError,
  parseSuggestedSessionPorts,
} from "@shared/host-port-probe-errors";
import type { SessionPortSet } from "@shared/types";

export function openHostPortProbeModal(args: {
  serverName: string;
  message: string;
  onStartThisSession: (ports: SessionPortSet) => void;
  onStartAnyway?: () => void;
  onEditPorts: () => void;
}): void {
  const suggested = parseSuggestedSessionPorts(args.message);
  const busy = isHostPortBusyError(args.message);
  const detail = humanizeHostPortProbeError(args.message);
  const canStartAnyway = !busy && args.onStartAnyway != null;

  modals.openConfirmModal({
    title: busy
      ? `Ports in use — ${args.serverName}`
      : `Could not verify ports — ${args.serverName}`,
    centered: true,
    children: (
      <Stack
        gap="sm"
        data-host-port-probe-modal
        data-host-port-probe-kind={busy ? "busy" : "inconclusive"}
        data-host-port-probe-suggested={suggested != null ? "true" : "false"}
      >
        <Alert
          color="orange"
          variant="light"
          title={busy ? "Host port busy" : "Probe inconclusive"}
        >
          {detail}
        </Alert>
        {suggested != null ? (
          <Text size="sm" data-host-port-probe-suggestion>
            Suggested free set for this session only: game {suggested.gamePort}, query{" "}
            {suggested.queryPort}, RCON {suggested.rconPort}. Saved profile ports stay unchanged.
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            {busy
              ? "No free alternative set was found. Edit the saved ports or free the host ports, then try again."
              : "No free alternative set was found. You can start anyway, edit saved ports, or free the host ports and retry."}
          </Text>
        )}
        <Button
          variant="default"
          data-host-port-probe-edit
          onClick={() => {
            modals.closeAll();
            args.onEditPorts();
          }}
        >
          Edit ports
        </Button>
        {canStartAnyway ? (
          <Button
            variant="light"
            color="orange"
            data-host-port-probe-start-anyway
            onClick={() => {
              modals.closeAll();
              args.onStartAnyway?.();
            }}
          >
            Start anyway
          </Button>
        ) : null}
      </Stack>
    ),
    labels: {
      confirm:
        suggested != null
          ? `Start this session on ${suggested.gamePort} / ${suggested.queryPort} / ${suggested.rconPort}`
          : "Close",
      cancel: "Cancel",
    },
    confirmProps: suggested != null ? { color: "orange" } : undefined,
    onConfirm: () => {
      if (suggested != null) {
        args.onStartThisSession(suggested);
      }
    },
  });
}
