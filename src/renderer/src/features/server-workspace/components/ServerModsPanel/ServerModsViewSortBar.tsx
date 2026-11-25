import type { ReactElement } from "react";
import { Button, Group, Tooltip } from "@mantine/core";
import { ArrowCounterClockwise, SortAscending } from "@phosphor-icons/react";
import classes from "./ServerModsPanel.module.css";

interface Props {
  showApplySortAsLoadOrder: boolean;
  applyDisabled: boolean;
  applyDisabledReason: string;
  onClearSort: () => void;
  onApplySortAsLoadOrder: () => void;
}

/** View-sort toolbar: clear temporary column sort, optionally write it as load order (#638). */
export function ServerModsViewSortBar(props: Props): ReactElement {
  return (
    <div className={classes.viewSortBar}>
      <Group gap="xs" wrap="wrap">
        <Button variant="default" leftSection={<ArrowCounterClockwise size={14} />} onClick={props.onClearSort}>
          Clear sort
        </Button>
        {props.showApplySortAsLoadOrder ? (
          <Tooltip label={props.applyDisabledReason} withArrow>
            <span>
              <Button
                variant="default"
                leftSection={<SortAscending size={14} />}
                disabled={props.applyDisabled}
                onClick={props.onApplySortAsLoadOrder}
              >
                Apply sort as load order
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Group>
    </div>
  );
}
