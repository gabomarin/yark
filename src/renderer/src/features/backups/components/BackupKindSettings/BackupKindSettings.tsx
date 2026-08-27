import type { ReactElement } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import {
  Group,
  NumberInput,
  Switch,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { BackupKind } from "@shared/types";
import type { DraftPolicy } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  draftPolicy: DraftPolicy;
  activeKind: BackupKind;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  settingsTitle: string;
  settingsSummary: string | null;
  busy: boolean;
  installReady: boolean;
  onDraftPolicyChange: (draft: DraftPolicy) => void;
}

export function BackupKindSettings(props: Props): ReactElement {
  const {
    draftPolicy,
    activeKind,
    settingsOpen,
    onSettingsOpenChange,
    settingsTitle,
    settingsSummary,
    busy,
    installReady,
    onDraftPolicyChange,
  } = props;

  return (
    <div
      className={classes.kindSettings}
      data-world-settings={activeKind === "world" ? true : undefined}
      data-players-settings={activeKind === "players" ? true : undefined}
      data-ini-settings={activeKind === "ini" ? true : undefined}
      data-settings-open={settingsOpen ? "true" : "false"}
    >
      <UnstyledButton
        className={classes.settingsToggle}
        onClick={() => onSettingsOpenChange(!settingsOpen)}
        aria-expanded={settingsOpen}
      >
        <Group gap={6} wrap="nowrap" className={classes.settingsToggleInner}>
          {settingsOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
          <Text fw={600} size="xs" className={classes.settingsToggleTitle}>
            {settingsTitle}
          </Text>
          {!settingsOpen && settingsSummary !== null && (
            <Text size="xs" c="dimmed" className={classes.settingsSummary}>
              {settingsSummary}
            </Text>
          )}
        </Group>
      </UnstyledButton>

      {settingsOpen && activeKind === "world" && (
        <Group align="center" gap="xs" wrap="wrap" mt={4} className={classes.kindSettingsFields}>
          <Switch
            size="sm"
            label="Schedule"
            checked={draftPolicy.enabled}
            disabled={busy || !installReady}
            onChange={(event) =>
              onDraftPolicyChange({
                ...draftPolicy,
                enabled: event.currentTarget.checked,
              })
            }
          />
          <Group gap={6} align="center" wrap="nowrap">
            <Text size="xs" component="label" htmlFor="backup-interval">
              Interval (min)
            </Text>
            <NumberInput
              id="backup-interval"
              aria-label="Interval (min)"
              size="xs"
              min={5}
              max={10_080}
              value={draftPolicy.intervalMinutes}
              disabled={busy || !installReady}
              onChange={(value) =>
                onDraftPolicyChange({
                  ...draftPolicy,
                  intervalMinutes:
                    typeof value === "number" ? value : draftPolicy.intervalMinutes,
                })
              }
              className={classes.policyField}
            />
          </Group>
          <Group gap={6} align="center" wrap="nowrap">
            <Text size="xs" component="label" htmlFor="backup-retain-world">
              Keep last (per map)
            </Text>
            <NumberInput
              id="backup-retain-world"
              aria-label="Keep last (per map)"
              size="xs"
              min={1}
              max={500}
              value={draftPolicy.retainCountWorld}
              onChange={(value) =>
                onDraftPolicyChange({
                  ...draftPolicy,
                  retainCountWorld:
                    typeof value === "number" ? value : draftPolicy.retainCountWorld,
                })
              }
              className={classes.policyField}
            />
          </Group>
        </Group>
      )}

      {settingsOpen && activeKind === "players" && (
        <Group gap="xs" align="center" wrap="nowrap" mt={4} className={classes.inlineRetain}>
          <Text size="xs" component="label" htmlFor="backup-retain-players">
            Keep last (per player)
          </Text>
          <NumberInput
            id="backup-retain-players"
            aria-label="Keep last (per player)"
            size="xs"
            min={1}
            max={500}
            value={draftPolicy.retainCountPlayers}
            onChange={(value) =>
              onDraftPolicyChange({
                ...draftPolicy,
                retainCountPlayers:
                  typeof value === "number" ? value : draftPolicy.retainCountPlayers,
              })
            }
            className={classes.compactRetain}
          />
        </Group>
      )}

      {settingsOpen && activeKind === "ini" && (
        <Group gap="xs" align="center" wrap="nowrap" mt={4} className={classes.inlineRetain}>
          <Text size="xs" component="label" htmlFor="backup-retain-ini">
            Keep last INI
          </Text>
          <NumberInput
            id="backup-retain-ini"
            aria-label="Keep last INI"
            size="xs"
            min={1}
            max={500}
            value={draftPolicy.retainCountIni}
            onChange={(value) =>
              onDraftPolicyChange({
                ...draftPolicy,
                retainCountIni:
                  typeof value === "number" ? value : draftPolicy.retainCountIni,
              })
            }
            className={classes.compactRetain}
          />
        </Group>
      )}
    </div>
  );
}
