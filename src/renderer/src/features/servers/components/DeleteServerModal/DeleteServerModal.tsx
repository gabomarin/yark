import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
} from "@mantine/core";
import type { DeleteServerOptions, InstallationHealthStatus } from "@shared/types";
import { EMPTY_WIPE_STALE_MESSAGE } from "@shared/types";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import classes from "./DeleteServerModal.module.css";

export type DeleteServerMode = "profileOnly" | "wipe";

export type DeleteServerConfirmResult =
  | { ok: true }
  | { ok: false; emptyWipeStale?: boolean };

/**
 * Empty install folders have nothing worth keeping, and Import (#254) rejects
 * them — skip the mode picker and always wipe (backend revalidates emptiness).
 */
export function isForcedWipeInstallHealth(
  health: InstallationHealthStatus | null | undefined,
): boolean {
  return health === "empty";
}

interface Props {
  opened: boolean;
  /** Profile id for the open target; used to ignore stale in-flight completions. */
  serverId: string;
  serverName: string;
  installDir: string;
  /** Latest install-health classification for this server (may be stale). */
  installHealth?: InstallationHealthStatus | null;
  onClose: () => void;
  /** Returns ok when delete succeeded; modal closes only then. */
  onConfirm: (options: DeleteServerOptions) => Promise<DeleteServerConfirmResult>;
}

export function DeleteServerModal(props: Props): ReactElement {
  const cachedEmpty = isForcedWipeInstallHealth(props.installHealth);
  /** Drop forced-empty shortcut after backend says the folder is no longer empty. */
  const [emptyShortcutAllowed, setEmptyShortcutAllowed] = useState(true);
  const [mode, setMode] = useState<DeleteServerMode>("profileOnly");
  const [loading, setLoading] = useState(false);
  const [staleEmptyNotice, setStaleEmptyNotice] = useState(false);
  const activeServerIdRef = useRef(props.serverId);
  activeServerIdRef.current = props.serverId;

  const forcedWipe = cachedEmpty && emptyShortcutAllowed;

  useEffect(() => {
    if (!props.opened) return;
    setEmptyShortcutAllowed(true);
    setStaleEmptyNotice(false);
    setMode(
      isForcedWipeInstallHealth(props.installHealth) ? "wipe" : "profileOnly",
    );
    setLoading(false);
    // Reset when opening or switching target; ignore installHealth polls mid-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/target reset
  }, [props.opened, props.serverId]);

  const wipe = forcedWipe || mode === "wipe";

  const handleConfirm = async (): Promise<void> => {
    const requestServerId = props.serverId;
    setLoading(true);
    try {
      const result = await props.onConfirm(
        forcedWipe
          ? { deleteInstallFiles: true, requireEmptyInstall: true }
          : { deleteInstallFiles: wipe },
      );
      if (activeServerIdRef.current !== requestServerId) return;
      if (result.ok) {
        props.onClose();
        return;
      }
      if (result.emptyWipeStale === true) {
        setEmptyShortcutAllowed(false);
        setStaleEmptyNotice(true);
        setMode("profileOnly");
      }
    } finally {
      if (activeServerIdRef.current === requestServerId) {
        setLoading(false);
      }
    }
  };

  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        if (!loading) props.onClose();
      }}
      title={`Remove server "${props.serverName}"`}
      centered
      size="md"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      <Stack gap="sm">
        {forcedWipe ? (
          <Alert
            title="Empty install folder"
            variant="light"
            className={classes.dangerAlert}
            color="gray"
          >
            This profile never received ASA files (empty folder). YARK will remove the server
            and delete the empty install path. Import cannot adopt an empty folder later. The
            folder is rechecked before wipe.
          </Alert>
        ) : (
          <>
            {staleEmptyNotice ? (
              <Alert color="orange" title="Folder is no longer empty" variant="light">
                {EMPTY_WIPE_STALE_MESSAGE}
              </Alert>
            ) : null}

            <Radio.Group
              value={mode}
              onChange={(value) => {
                if (value === "profileOnly" || value === "wipe") {
                  setMode(value);
                }
              }}
              name="delete-server-mode"
              aria-label="Removal mode"
            >
              <div className={classes.options}>
                <Radio.Card
                  className={classes.card}
                  value="profileOnly"
                  radius="md"
                  withBorder={false}
                >
                  <div className={classes.cardInner}>
                    <div className={classes.titleRow}>
                      <Radio.Indicator className={classes.indicator} />
                      <div className={classes.titleText}>
                        <Text size="sm" fw={600} lh={1.35}>
                          Remove from YARK only
                        </Text>
                      </div>
                    </div>
                    <Text size="xs" c="dimmed" lh={1.45} className={classes.description}>
                      Delete the managed profile. Keep world, configs, mods, and binaries on disk.
                    </Text>
                  </div>
                </Radio.Card>

                <Radio.Card
                  className={classes.card}
                  value="wipe"
                  radius="md"
                  withBorder={false}
                  mod={{ danger: true }}
                >
                  <div className={classes.cardInner}>
                    <div className={classes.titleRow}>
                      <Radio.Indicator className={classes.indicator} />
                      <div className={classes.titleText}>
                        <Text
                          size="sm"
                          fw={600}
                          lh={1.35}
                          className={wipe ? classes.dangerTitle : undefined}
                        >
                          Delete everything
                        </Text>
                        <Badge
                          size="xs"
                          variant="outline"
                          tt="uppercase"
                          className={classes.dangerBadge}
                        >
                          Danger
                        </Badge>
                      </div>
                    </div>
                    <Text size="xs" c="dimmed" lh={1.45} className={classes.description}>
                      Remove the profile and permanently wipe the install folder.
                    </Text>
                  </div>
                </Radio.Card>
              </div>
            </Radio.Group>

            {wipe ? (
              <Alert
                title="Everything will be deleted"
                variant="light"
                className={classes.dangerAlert}
                color="gray"
              >
                This server in YARK and all on-disk content (world, configs, mods, and binaries)
                will be deleted. This cannot be undone.
              </Alert>
            ) : (
              <Alert color="blue" title="Install folder will be kept" variant="light">
                YARK stops managing this server. The ASA folder stays on disk for manual launch
                or a later Import (Import requires a ready ASA install).
              </Alert>
            )}
          </>
        )}

        <div>
          <Text size="xs" c="dimmed" mb={4}>
            {wipe ? "Folder that will be deleted:" : "Folder that will be kept:"}
          </Text>
          <ReadonlyPath value={props.installDir} compact />
        </div>

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="default" onClick={props.onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            className={wipe ? classes.dangerButton : undefined}
            loading={loading}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {wipe ? "Delete everything" : "Remove from YARK"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
