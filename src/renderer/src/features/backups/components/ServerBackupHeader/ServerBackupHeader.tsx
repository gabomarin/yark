import { Text } from "@mantine/core";
import type { ReactElement } from "react";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import { BACKUPS_KINDS_HINT_STORAGE_KEY } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

/** Embedded section chrome; tab label supplies the page heading (#231). */
export function ServerBackupHeader(props: Props): ReactElement {
  return (
    <div className={classes.embeddedHeader} data-server-backup-header>
      <Text fw={600} size="sm" className={classes.embeddedHeaderTitle}>
        {props.title}
      </Text>
      <DismissibleHint storageKey={BACKUPS_KINDS_HINT_STORAGE_KEY} title="World vs players vs INI">
        {props.subtitle}
      </DismissibleHint>
    </div>
  );
}
