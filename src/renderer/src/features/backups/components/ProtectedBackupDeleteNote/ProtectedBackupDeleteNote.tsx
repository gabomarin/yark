import type { ReactElement } from "react";
import { Box, Text } from "@mantine/core";
import classes from "./ProtectedBackupDeleteNote.module.css";

type Props = {
  note: string;
};

/** Raised callout for the operator note on protected-backup delete confirms. */
export function ProtectedBackupDeleteNote(props: Props): ReactElement {
  return (
    <Box className={classes.noteBox} data-backup-protected-delete-note>
      <Text size="xs" c="dimmed" mb={4}>
        Operator note
      </Text>
      <Text size="sm">{props.note}</Text>
    </Box>
  );
}
