import type { ReactElement } from "react";
import { Group, Text, Tooltip } from "@mantine/core";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import { BACKUP_PROTECT_HELP_TOOLTIP } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

export interface BackupProtectSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Policy Protect control: Text xs label + switch, with shared help tooltip.
 * Matches Interval / Keep last typography in BackupKindSettings.
 */
export function BackupProtectSwitch(props: BackupProtectSwitchProps): ReactElement {
  const { id, label, checked, disabled = false, onCheckedChange } = props;
  return (
    <Tooltip label={BACKUP_PROTECT_HELP_TOOLTIP} multiline maw={320} withArrow>
      <span className={classes.protectSwitchHit}>
        <Group gap={6} align="center" wrap="nowrap">
          <Text size="xs" component="label" htmlFor={id}>
            {label}
          </Text>
          <AppSwitch
            id={id}
            size="sm"
            aria-label={label}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
          />
        </Group>
      </span>
    </Tooltip>
  );
}
