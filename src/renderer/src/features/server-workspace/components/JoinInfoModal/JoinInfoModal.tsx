import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ActionIcon, Box, Group, Loader, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { ArrowClockwise, Copy } from "@phosphor-icons/react";
import type { ServerProfile } from "@shared/types";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import { CopyMetadataRow } from "@ui/CopyMetadataRow/CopyMetadataRow";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import {
  buildJoinFieldCopies,
  buildOpenCommand,
  getPublicIpStatusText,
  hasJoinPassword,
  isJoinHostUsable,
  maskJoinPassword,
  type JoinInfoInput,
} from "./joinInfoModel";

interface Props {
  opened: boolean;
  serverRunning?: boolean;
  onClose: () => void;
  server: ServerProfile;
  /** Shared with the workspace header; the dialog can refresh this value. */
  publicIp: string;
  refreshPublicIp: () => Promise<boolean>;
}

type IpState = "idle" | "loading" | "detected" | "failed";

/**
 * Workspace join surface (#505). Builds the in-game console command
 * `open IP:PORT` and copies the join fields a friend needs. It never claims the
 * server is reachable and ships no `steam://` deep link.
 */
export function JoinInfoModal(props: Props): ReactElement {
  return (
    <AppPanelModal
      opened={props.opened}
      onClose={props.onClose}
      title="Share connection details"
      meta="Copy what players need to find and join this server."
      size="md"
      data-testid="join-info-modal"
    >
      {props.opened ? <JoinInfoModalContent {...props} /> : null}
    </AppPanelModal>
  );
}

function JoinInfoModalContent(props: Props): ReactElement {
  const { serverRunning, publicIp, refreshPublicIp } = props;
  const [ipState, setIpState] = useState<IpState>("idle");
  const didAutoDetectRef = useRef(false);

  const runDetect = useCallback(async () => {
    setIpState("loading");
    try {
      const refreshed = await refreshPublicIp();
      setIpState(refreshed ? "detected" : "failed");
    } catch {
      setIpState("failed");
    }
  }, [refreshPublicIp]);

  useEffect(() => {
    if (!didAutoDetectRef.current && serverRunning !== true && !isJoinHostUsable(publicIp)) {
      didAutoDetectRef.current = true;
      void runDetect();
    }
  }, [publicIp, serverRunning, runDetect]);

  const hasIp = publicIp.trim().length > 0;

  const input: JoinInfoInput = {
    sessionName: props.server.sessionName,
    gamePort: props.server.gamePort,
    serverPassword: props.server.serverPassword,
    queryPort: props.server.queryPort,
  };
  const fields = buildJoinFieldCopies(input);
  const command = buildOpenCommand(publicIp, props.server.gamePort);
  const hostInvalid = publicIp.trim().length > 0 && !isJoinHostUsable(publicIp);
  const maskedPassword = maskJoinPassword(props.server.serverPassword);
  const hasPassword = hasJoinPassword(props.server.serverPassword);

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        Connection details
      </Text>
      <Group gap="sm" wrap="nowrap" align="center">
        <Box style={{ flex: 1, minWidth: 0 }}>
          {hasIp && !hostInvalid ? (
            <CopyMetadataRow
              label="Public IP address"
              value={publicIp.trim()}
              failureMessage="Could not copy the public IP address"
            />
          ) : (
            <Stack gap={2}>
              <Text c="dimmed" tt="uppercase" fw={500} size="xs">
                Public IP address
              </Text>
              <Text size="sm" c="dimmed">
                {hostInvalid ? "Detected address is invalid" : ipState === "loading" ? "Detecting…" : "Not detected"}
              </Text>
            </Stack>
          )}
        </Box>
        {ipState === "loading" ? (
          <Loader size={16} data-testid="join-info-detecting" />
        ) : (
          <Tooltip label="Refresh public IP">
            <ActionIcon variant="subtle" color="gray" aria-label="Refresh public IP" onClick={() => void runDetect()}>
              <ArrowClockwise size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="xs" c="dimmed" role={ipState === "failed" || hostInvalid ? "status" : undefined}>
        {getPublicIpStatusText(ipState, hasIp, hostInvalid)}
      </Text>

      {command !== null ? (
        <CopyMetadataRow label="In-game command" value={command} failureMessage="Could not copy the in-game command" />
      ) : (
        <Stack gap={2}>
          <Text c="dimmed" tt="uppercase" fw={500} size="xs">
            In-game command
          </Text>
          <Text size="sm" c="dimmed">
            Available when a public IP is detected.
          </Text>
        </Stack>
      )}
      <Text size="xs" c="dimmed">
        Paste the command into ARK’s console (Tab or ~) to connect.
      </Text>

      <Text size="xs" c="dimmed">
        Players can join only when the server is reachable from the internet.
      </Text>

      {hasPassword ? (
        <Group gap="xs" align="center">
          <Text size="sm">
            Join password:{" "}
            <Text span ff="monospace">
              {maskedPassword}
            </Text>
          </Text>
          <Tooltip label="Copy join password">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Copy join password"
              onClick={() =>
                void copyTextToClipboard({
                  text: fields.password,
                  notifySuccess: true,
                  successMessage: "Join password copied",
                })
              }
            >
              <Copy size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : null}

      <Text fw={600} size="sm" mt="xs">
        Server details
      </Text>
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
        <CopyMetadataRow
          label="Session name"
          value={fields.sessionName}
          failureMessage="Could not copy the session name"
        />
        <CopyMetadataRow label="Game port" value={fields.gamePort} failureMessage="Could not copy the game port" />
        <CopyMetadataRow label="Query port" value={fields.queryPort} failureMessage="Could not copy the query port" />
      </SimpleGrid>

      <AppAlert color="attention" title="Router and firewall">
        Forward the game port so players can connect. Forward the query port too if they need to find this server in the
        server browser.
      </AppAlert>
    </Stack>
  );
}
