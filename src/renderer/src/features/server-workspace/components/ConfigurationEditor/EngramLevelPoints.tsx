import type { ReactElement } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { ActionIcon, Button, Group, NumberInput, Text, Tooltip } from "@mantine/core";
import {
  isPlayerLevelEngramPointsValue,
  listPlayerLevelEngramPoints,
} from "@shared/ini/player-level-engram-points";
import { appRaisedSurfaceClass, withAppSurface } from "@ui/AppSurface/appSurfaceClassName";
import classes from "./ConfigurationEditor.module.css";

interface Props {
  gameText: string;
  loading: boolean;
  busy: boolean;
  onChange: (section: string, occurrence: number, value: string) => void;
  onAddLevel: () => void;
  onRemove: (section: string, occurrence: number) => void;
}

export function EngramLevelPoints(props: Props): ReactElement {
  const rows = listPlayerLevelEngramPoints(props.gameText);

  return (
    <>
      <Group gap="xs" justify="space-between">
        <Text c="dimmed" size="sm">
          Points granted at each level. The first line is level 1.
        </Text>
        <Button
          size="xs"
          variant="default"
          disabled={props.busy || props.loading}
          leftSection={<Plus size={14} />}
          onClick={props.onAddLevel}
        >
          Add level
        </Button>
      </Group>

      <div className={withAppSurface(appRaisedSurfaceClass, classes.tableWrap)}>
        <div className={classes.levelPointsHead}>
          <span>Level</span>
          <span>Points</span>
          <span />
        </div>
        <div className={classes.levelPointsBody}>
          {props.loading && (
            <Text c="dimmed" p="md">
              Loading INI…
            </Text>
          )}
          {!props.loading && rows.length === 0 && (
            <Text c="dimmed" p="md">
              This Game.ini does not set points per level. The game is using its own points.
            </Text>
          )}
          {!props.loading &&
            rows.map((row) => {
              const valid = isPlayerLevelEngramPointsValue(row.points);
              return (
                <div key={`${row.section}-${row.occurrence}`} className={classes.levelPointsRow}>
                  <Text size="sm">{row.level}</Text>
                  <NumberInput
                    aria-label={`Points for level ${row.level}`}
                    size="xs"
                    min={0}
                    max={9_999_999}
                    allowDecimal={false}
                    allowNegative={false}
                    hideControls
                    disabled={props.busy}
                    value={valid ? Number(row.points) : ""}
                    error={valid ? undefined : "Enter a whole number from 0 to 9999999."}
                    onChange={(value) => {
                      const next = value === "" || value === undefined ? "" : String(value);
                      if (!isPlayerLevelEngramPointsValue(next)) return;
                      props.onChange(row.section, row.occurrence, next);
                    }}
                  />
                  <div className={classes.rowActions}>
                    <Tooltip label="Remove this level. Later levels move up.">
                      <ActionIcon
                        variant="subtle"
                        color="attention"
                        disabled={props.busy}
                        aria-label={`Remove level ${row.level}`}
                        onClick={() => props.onRemove(row.section, row.occurrence)}
                      >
                        <Trash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <Text c="dimmed" size="xs">
        Each line is OverridePlayerLevelEngramPoints. The number of lines should match the player levels on this server. Removing a line moves the later levels up.
      </Text>
    </>
  );
}
