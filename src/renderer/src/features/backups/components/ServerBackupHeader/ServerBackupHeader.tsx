import { Text, Title } from "@mantine/core";
import type { ReactElement } from "react";
import classes from "../../BackupsPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

export function ServerBackupHeader(props: Props): ReactElement {
  return (
    <div className={classes.embeddedHeader} data-server-backup-header>
      <Title order={4}>{props.title}</Title>
      <Text size="sm" c="dimmed">
        {props.subtitle}
      </Text>
    </div>
  );
}
