import type { ReactElement } from "react";
import { NumberInput, PasswordInput, SimpleGrid, Stack, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { ServerFormPortConflictAlert } from "./ServerFormPortConflictAlert";
import classes from "./ServerForm.module.css";

interface Props {
  inputSize: "xs" | "sm";
  servers: ServerProfile[];
  excludeServerId?: string;
  name: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  maxPlayers: string;
  serverPassword: string;
  adminPassword: string;
  createPortSuggestion?: { offset: number; exhausted: boolean } | null;
  onGamePortChange: (value: string) => void;
  onQueryPortChange: (value: string) => void;
  onRconPortChange: (value: string) => void;
  onMaxPlayersChange: (value: string) => void;
  onServerPasswordChange: (value: string) => void;
  onAdminPasswordChange: (value: string) => void;
}

function createPortsDescription(
  suggestion: Props["createPortSuggestion"],
): string | undefined {
  if (suggestion == null) {
    return undefined;
  }
  if (suggestion.exhausted) {
    return "Could not auto-suggest ports that avoid other YARK servers — pick unused ports.";
  }
  if (suggestion.offset > 0) {
    return "Suggested to avoid other YARK servers.";
  }
  return undefined;
}

/** Ports row + passwords; conflict alert uses leftover card space (#292). */
export function ServerFormReachabilityFields(props: Props): ReactElement {
  const portsDescription = createPortsDescription(props.createPortSuggestion);

  return (
    <>
      <Stack gap={4}>
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
          <NumberInput
            label="Game port"
            size={props.inputSize}
            value={props.gamePort}
            onChange={(value) => props.onGamePortChange(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="Query port"
            size={props.inputSize}
            value={props.queryPort}
            onChange={(value) => props.onQueryPortChange(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
          <NumberInput
            label="RCON port"
            size={props.inputSize}
            value={props.rconPort}
            onChange={(value) => props.onRconPortChange(String(value))}
            min={1}
            max={65535}
            allowDecimal={false}
            required
          />
        </SimpleGrid>
        {portsDescription !== undefined ? (
          <Text size="xs" c="cyan" fw={500}>
            {portsDescription}
          </Text>
        ) : null}
      </Stack>
      <NumberInput
        label="Max players"
        size={props.inputSize}
        value={props.maxPlayers}
        onChange={(value) => props.onMaxPlayersChange(String(value))}
        min={0}
        max={255}
        allowDecimal={false}
        clampBehavior="none"
        description="Slot limit passed as -WinLiveMaxPlayers. Empty or 0 omits the flag."
      />
      <Stack gap="sm">
        <PasswordInput
          label="Server password"
          size={props.inputSize}
          value={props.serverPassword}
          onChange={(e) => props.onServerPasswordChange(e.currentTarget.value)}
          autoComplete="new-password"
          description="Optional"
        />
        <PasswordInput
          label="Admin password"
          size={props.inputSize}
          value={props.adminPassword}
          onChange={(e) => props.onAdminPasswordChange(e.currentTarget.value)}
          autoComplete="new-password"
          required
          description="Written to GameUserSettings.ini, not the launch command."
        />
      </Stack>
      <div className={classes.reachabilityAlertSlot} aria-live="polite">
        <ServerFormPortConflictAlert
          slot
          servers={props.servers}
          excludeServerId={props.excludeServerId}
          name={props.name}
          gamePort={props.gamePort}
          queryPort={props.queryPort}
          rconPort={props.rconPort}
        />
      </div>
    </>
  );
}
