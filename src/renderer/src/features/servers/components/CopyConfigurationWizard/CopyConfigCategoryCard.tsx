import type { ReactElement, ReactNode } from "react";
import { Checkbox, Stack, Text } from "@mantine/core";
import classes from "./CopyConfigCategoryCard.module.css";

interface Props {
  title: string;
  description: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  /** Fossil amber chrome for sensitive categories (passwords). */
  tone?: "default" | "fossil";
  children?: ReactNode;
}

export function CopyConfigCategoryCard(props: Props): ReactElement {
  const fossil = props.tone === "fossil";
  const active = props.checked || props.indeterminate === true;
  const showBody = active && props.children !== undefined && props.children !== null;

  return (
    <div
      className={classes.root}
      data-active={!fossil && active ? true : undefined}
      data-tone={fossil ? "fossil" : undefined}
    >
      <Checkbox
        checked={props.checked}
        indeterminate={props.indeterminate === true && !props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        label={
          <Stack gap={4}>
            <Text size="sm" fw={600} component="span">
              {props.title}
            </Text>
            <Text size="sm" c="dimmed" component="span">
              {props.description}
            </Text>
          </Stack>
        }
      />
      {showBody ? <div className={classes.body}>{props.children}</div> : null}
    </div>
  );
}
