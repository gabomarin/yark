import { Text } from "@mantine/core";
import type { ReactElement } from "react";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import classes from "../../BackupsPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

const BACKUPS_HINT_KEY = "yark.backups.kindsHint.dismissed.v1";

/** Embedded section chrome; tab label supplies the page heading (#231). */
export function ServerBackupHeader(props: Props): ReactElement {
  return (
    <div className={classes.embeddedHeader} data-server-backup-header>
      <Text fw={600} size="sm" className={classes.embeddedHeaderTitle}>
        {props.title}
      </Text>
      <DismissibleHint storageKey={BACKUPS_HINT_KEY} title="World vs players vs INI">
        {props.subtitle}
      </DismissibleHint>
    </div>
  );
}
