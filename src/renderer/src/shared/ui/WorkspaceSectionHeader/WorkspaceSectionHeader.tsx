import type { ReactElement, ReactNode } from "react";
import { Group, Text, Title } from "@mantine/core";
import classes from "./WorkspaceSectionHeader.module.css";

interface Props {
  /** Omit when the words would only repeat the workspace tab. */
  title?: string;
  subtitle: string;
  /** Right-side actions. Same size as the other workspace header buttons. */
  actions?: ReactNode;
  /** Full-width row under the title, still inside the header band. */
  toolbar?: ReactNode;
  className?: string;
  /** Keeps the backups visual script pointed at this band. */
  "data-server-backup-header"?: true;
}

/** Pinned band shared by workspace tabs: optional title, one help line, actions. */
export function WorkspaceSectionHeader(props: Props): ReactElement {
  return (
    <header
      className={[classes.header, props.className].filter(Boolean).join(" ")}
      data-workspace-section-header
      data-server-backup-header={props["data-server-backup-header"]}
    >
      <div className={classes.row}>
        <div className={classes.copy}>
          {props.title !== undefined && (
            <Title order={4} mb={0} className={classes.title}>
              {props.title}
            </Title>
          )}
          <Text c="dimmed" fz="xs">
            {props.subtitle}
          </Text>
        </div>
        {props.actions != null && (
          <Group gap="xs" wrap="wrap" justify="flex-end" className={classes.actions}>
            {props.actions}
          </Group>
        )}
      </div>
      {props.toolbar != null && <div className={classes.toolbar}>{props.toolbar}</div>}
    </header>
  );
}
