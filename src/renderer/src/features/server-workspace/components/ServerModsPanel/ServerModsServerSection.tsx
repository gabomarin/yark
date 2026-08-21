import type { ReactElement } from "react";
import { Button } from "@mantine/core";
import { PuzzlePiece } from "@phosphor-icons/react";
import type { ModAddImportProgress } from "@shared/mod-add-input";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { ServerModsTable } from "./ServerModsTable";
import { ServerModsUrlInput } from "./ServerModsUrlInput";
import type { ModRow } from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

interface Props {
  url: string;
  busyKey: string | null;
  importProgress: ModAddImportProgress | null;
  rows: ModRow[];
  onUrlChange: (value: string) => void;
  onAdd: () => void;
  onDiscover: () => void;
  onInspect: (row: ModRow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onOpenExternal: (url: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function ServerModsServerSection(props: Props): ReactElement {
  return (
    <div className={classes.sectionLayout}>
      <div className={classes.sectionTop}>
        <ServerModsUrlInput
          value={props.url}
          busy={props.busyKey === "url"}
          progress={props.importProgress}
          onChange={props.onUrlChange}
          onAdd={props.onAdd}
        />
      </div>
      <div className={classes.sectionMain}>
        {props.rows.length === 0 ? (
          <EmptyState
            layout="stacked"
            icon={<PuzzlePiece size={24} />}
            title="No mods configured for this server"
            description="Paste a CurseForge ASA mod URL or use Discover mods."
            action={
              <Button variant="light" onClick={props.onDiscover}>
                Discover mods
              </Button>
            }
          />
        ) : (
          <ServerModsTable
            rows={props.rows}
            mode="server"
            busyKey={props.busyKey}
            onInspect={props.onInspect}
            onAdd={() => undefined}
            onToggle={props.onToggle}
            onRemove={props.onRemove}
            onOpenExternal={props.onOpenExternal}
            onReorder={props.onReorder}
          />
        )}
      </div>
    </div>
  );
}
