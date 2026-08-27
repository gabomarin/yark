import { Text } from "@mantine/core";
import type { ReactElement } from "react";
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
      <Text size="sm" c="dimmed">
        {props.subtitle}
      </Text>
    </div>
  );
}
