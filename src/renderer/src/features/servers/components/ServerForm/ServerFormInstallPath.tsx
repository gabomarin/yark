import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import type { FleetInstallRef } from "@shared/server/server-install-path";
import { PathField } from "@ui/PathField/PathField";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import {
  diskCreateInstallWarning,
  fleetCreateInstallWarning,
} from "./createInstallPathWarning";

interface Props {
  isCreate: boolean;
  installDir: string;
  resolvedInstallPreview: string;
  fleetInstalls?: readonly FleetInstallRef[];
  inputSize: "xs" | "sm" | "md";
  browsingInstallDir: boolean;
  moveDisabled: boolean;
  moveDisabledReason: string | undefined;
  onInstallDirChange: (value: string) => void;
  onBrowseInstallDir: () => void;
  onOpenMove: () => void;
  onCreatePathIssueChange?: (message: string | null) => void;
}

/** Create-time base folder picker vs edit-time read-only path + Move. */
export function ServerFormInstallPath(props: Props): ReactElement {
  const { isCreate, onCreatePathIssueChange, resolvedInstallPreview } = props;
  const pathCompact = props.inputSize === "xs";
  const fleetWarning = useMemo(() => {
    if (!props.isCreate || props.resolvedInstallPreview.length === 0) {
      return null;
    }
    return fleetCreateInstallWarning(
      props.resolvedInstallPreview,
      props.fleetInstalls ?? [],
    );
  }, [props.fleetInstalls, props.isCreate, props.resolvedInstallPreview]);

  const [diskWarning, setDiskWarning] = useState<{
    path: string;
    message: string | null;
  } | null>(null);
  const [debouncedPreview] = useDebouncedValue(props.resolvedInstallPreview, 400);

  useEffect(() => {
    if (!props.isCreate || debouncedPreview.length === 0 || fleetWarning !== null) {
      setDiskWarning(null);
      return;
    }
    const probe = window.api?.probeImportInstall;
    if (typeof probe !== "function") {
      setDiskWarning(null);
      return;
    }
    const probedPath = debouncedPreview;
    let cancelled = false;
    setDiskWarning(null);
    void probe(probedPath)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setDiskWarning(null);
          return;
        }
        setDiskWarning({
          path: probedPath,
          message: diskCreateInstallWarning(result.data),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDiskWarning(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedPreview, fleetWarning, props.isCreate]);

  const diskIssue =
    props.resolvedInstallPreview === debouncedPreview &&
    diskWarning?.path === debouncedPreview
      ? diskWarning.message
      : null;
  const createPathIssue = fleetWarning ?? diskIssue;

  useEffect(() => {
    onCreatePathIssueChange?.(
      isCreate && resolvedInstallPreview.length > 0
        ? createPathIssue
        : null,
    );
  }, [createPathIssue, isCreate, onCreatePathIssueChange, resolvedInstallPreview]);

  if (props.isCreate) {
    return (
      <>
        <PathField
          label="Base folder"
          value={props.installDir}
          placeholder="C:\\ark_servers"
          busy={props.browsingInstallDir}
          size={props.inputSize}
          required
          description="Where this profile’s install folder will be created. Create does not download ASA files – use Install files after."
          onChange={props.onInstallDirChange}
          onBrowse={props.onBrowseInstallDir}
        />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Final install path
          </Text>
          <ReadonlyPath
            value={
              props.resolvedInstallPreview.length > 0
                ? props.resolvedInstallPreview
                : null
            }
            emptyLabel="pick a base folder and name"
            compact={pathCompact}
          />
        </Stack>
        {createPathIssue !== null && (
          <Alert color="red" title="Install path" mt="xs">
            <Text size="sm">{createPathIssue}</Text>
          </Alert>
        )}
      </>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Install directory
      </Text>
      <ReadonlyPath value={props.installDir} compact={pathCompact} />
      <Group>
        <Button
          size={props.inputSize}
          variant="default"
          leftSection={<ArrowsLeftRight size={16} />}
          disabled={props.moveDisabled}
          onClick={props.onOpenMove}
          title={props.moveDisabledReason}
        >
          Move installation…
        </Button>
      </Group>
    </Stack>
  );
}
