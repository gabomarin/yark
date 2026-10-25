import type { ReactElement } from "react";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";

interface Props {
  subtitle: string;
}

/** Embedded section chrome; the Backups tab already names the page (#231). */
export function ServerBackupHeader(props: Props): ReactElement {
  return <WorkspaceSectionHeader title="Backups" subtitle={props.subtitle} data-server-backup-header />;
}
