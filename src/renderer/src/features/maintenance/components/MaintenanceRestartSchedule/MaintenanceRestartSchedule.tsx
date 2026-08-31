import { ActionIcon, Button, Group, Stack, Text } from "@mantine/core";
import { TimePicker } from "@mantine/dates";
import { Clock } from "@phosphor-icons/react";
import type { MaintenancePolicyStatus } from "@shared/types";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
  ALL_RESTART_DAYS_OF_WEEK,
  DAY_SHORT,
  normalizeRestartDaysOfWeek,
} from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

interface Props {
  policy: MaintenancePolicyStatus;
  disabled: boolean;
  onPatchDays: (days: number[]) => void;
  onPatchTime: (timeLocal: string) => void;
}

/** Restart schedule: multi-day + Mantine TimePicker (#315). */
export function MaintenanceRestartSchedule(props: Props): ReactElement {
  const [timeDropdownOpened, setTimeDropdownOpened] = useState(false);
  const [timeLocal, setTimeLocal] = useState(props.policy.restartTimeLocal);
  const days = normalizeRestartDaysOfWeek(props.policy.restartDaysOfWeek);
  const everyDay = days.length === 7;

  useEffect(() => {
    setTimeLocal(props.policy.restartTimeLocal);
  }, [props.policy.restartTimeLocal]);

  const commitTimeIfChanged = useCallback(() => {
    if (timeLocal !== props.policy.restartTimeLocal) {
      props.onPatchTime(timeLocal);
    }
  }, [timeLocal, props.policy.restartTimeLocal, props.onPatchTime]);

  return (
    <Stack gap="sm">
      <div>
        <Text className={classes.fieldLabel}>On these days</Text>
        <Text size="xs" c="dimmed" mt={2}>
          Pick one or more days.
        </Text>
      </div>
      <Group gap={6} wrap="wrap">
        <Button
          size="compact-xs"
          variant={everyDay ? "light" : "default"}
          disabled={props.disabled}
          onClick={() => props.onPatchDays([...ALL_RESTART_DAYS_OF_WEEK])}
        >
          Every day
        </Button>
        {DAY_SHORT.map((label, dow) => {
          const on = days.includes(dow);
          return (
            <button
              key={label}
              type="button"
              disabled={props.disabled}
              className={`${classes.offsetChip}${on ? ` ${classes.offsetChipOn}` : ""}`}
              onClick={() => {
                const next = on
                  ? days.filter((d) => d !== dow)
                  : [...days, dow];
                if (next.length === 0) return;
                props.onPatchDays(normalizeRestartDaysOfWeek(next));
              }}
            >
              {label}
            </button>
          );
        })}
      </Group>
      <TimePicker
        label="Restart time"
        value={timeLocal}
        onChange={(value) => {
          const hhmm = value?.slice(0, 5);
          if (hhmm !== undefined && /^\d{2}:\d{2}$/.test(hhmm)) {
            setTimeLocal(hhmm);
          }
        }}
        disabled={props.disabled}
        size="xs"
        w={200}
        format="24h"
        withSeconds={false}
        withDropdown
        onBlur={() => {
          if (!timeDropdownOpened) commitTimeIfChanged();
        }}
        rightSection={
          <ActionIcon
            variant="default"
            size="sm"
            disabled={props.disabled}
            aria-label="Open time list"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setTimeDropdownOpened(true)}
          >
            <Clock size={16} aria-hidden />
          </ActionIcon>
        }
        popoverProps={{
          opened: timeDropdownOpened,
          onChange: (opened) => {
            if (!opened) {
              setTimeDropdownOpened(false);
              commitTimeIfChanged();
            }
          },
        }}
      />
    </Stack>
  );
}
