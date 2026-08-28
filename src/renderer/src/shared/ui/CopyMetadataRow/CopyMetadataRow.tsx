import type { ReactElement } from "react";
import { ActionIcon, Stack, Text, Tooltip } from "@mantine/core";
import { Copy } from "@phosphor-icons/react";
import { copyTextToClipboard } from "@ui/copyToClipboard";
import classes from "./CopyMetadataRow.module.css";

interface Props {
  label: string;
  value: string;
  failureMessage: string;
  /** Highlight unverified values (bare *_WP inference). */
  warn?: boolean;
}

/** Compact label + monospace value + inline copy icon after the text. */
export function CopyMetadataRow(props: Props): ReactElement {
  const copyLabel = props.label.replace(/:$/, "");
  return (
    <Stack gap={2} className={classes.root}>
      <Text
        c="dimmed"
        tt="uppercase"
        fw={500}
        className={classes.label}
      >
        {props.label}
      </Text>
      <div className={classes.valueLine}>
        <Text
          span
          ff="monospace"
          fw={600}
          size="sm"
          c={props.warn ? "yellow" : undefined}
          className={classes.value}
        >
          {props.value}
        </Text>
        <Tooltip label={`Copy ${copyLabel}`}>
          <ActionIcon
            component="span"
            variant="subtle"
            color="gray"
            size="sm"
            radius="md"
            aria-label={`Copy ${copyLabel}`}
            className={classes.copyIcon}
            onClick={() => void copyTextToClipboard({
              text: props.value,
              failureMessage: props.failureMessage,
            })}
          >
            <Copy size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    </Stack>
  );
}
