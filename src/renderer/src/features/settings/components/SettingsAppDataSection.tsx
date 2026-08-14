import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { FolderOpen } from "@phosphor-icons/react";
import { Button, Stack, Text, Title } from "@mantine/core";
import type { AppDataFolderInfo, AppDataFolderKind } from "@shared/ipc";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { bundledSteamCmdUnusedNote } from "../settingsModel";
import classes from "../SettingsPage.module.css";

interface Props {
  shellError: string | null;
  onClearShellError: () => void;
  steamCmdExecutablePath: string | null;
}

export function SettingsAppDataSection(props: Props): ReactElement {
  const [dataFolders, setDataFolders] = useState<AppDataFolderInfo[]>([]);
  const [dataFoldersError, setDataFoldersError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.listAppDataFolders();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setDataFoldersError(result.error ?? "Could not list app data folders");
        setDataFolders([]);
        return;
      }
      setDataFoldersError(null);
      setDataFolders(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDataFolder = async (kind: AppDataFolderKind): Promise<void> => {
    setDataFoldersError(null);
    props.onClearShellError();
    const result = await window.api.openAppDataFolder(kind);
    if (!result.ok) {
      setDataFoldersError(result.error ?? "Could not open folder");
    }
  };

  return (
    <section
      className={classes.section}
      aria-labelledby="settings-data"
      data-app-data-folders
    >
      <Title order={3} size="h4" id="settings-data">
        App data folders
      </Title>

      {(dataFoldersError ?? props.shellError) !== null && (
        <Text size="xs" c="red">
          {dataFoldersError ?? props.shellError}
        </Text>
      )}

      <Stack gap="sm" className={classes.cacheList}>
        {dataFolders.map((folder) => {
          const unusedNote =
            folder.kind === "steamcmd"
              ? bundledSteamCmdUnusedNote(folder.path, props.steamCmdExecutablePath)
              : null;
          return (
            <div key={folder.kind} className={classes.dataFolderRow}>
              <Text size="sm" fw={600}>{folder.label}</Text>
              <div className={classes.dataFolderPathRow}>
                <ReadonlyPath
                  className={classes.dataFolderPath}
                  value={folder.path}
                  compact
                />
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<FolderOpen size={14} />}
                  onClick={() => void openDataFolder(folder.kind)}
                >
                  Open
                </Button>
              </div>
              {unusedNote !== null && (
                <Text size="xs" c="dimmed" data-bundled-steamcmd-note>
                  {unusedNote}
                </Text>
              )}
            </div>
          );
        })}
      </Stack>
    </section>
  );
}
