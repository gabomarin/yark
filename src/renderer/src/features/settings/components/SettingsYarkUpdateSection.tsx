import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  ArrowSquareOut,
  ArrowClockwise,
  CloudArrowDown,
} from "@phosphor-icons/react";
import { Button, Group, Progress, Text, Title } from "@mantine/core";
import type { AppUpdateStatus } from "@shared/app-update";
import { createIdleAppUpdateStatus } from "@shared/app-update";
import classes from "../SettingsPage.module.css";

interface Props {
  appVersion: string;
  /** When true, scroll this section into view (sidebar deep-link). */
  focusSection?: boolean;
  onFocused?: () => void;
}

function statusLabel(status: AppUpdateStatus): string {
  switch (status.phase) {
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "You’re up to date";
    case "available":
      return status.availableVersion !== null && status.availableVersion.length > 0
        ? `Update available · v${status.availableVersion}`
        : "Update available";
    case "downloading":
      return status.percent !== null
        ? `Downloading… ${status.percent}%`
        : "Downloading…";
    case "ready":
      return status.availableVersion !== null && status.availableVersion.length > 0
        ? `Ready to install · v${status.availableVersion}`
        : "Ready to install";
    case "error":
      return "Check failed";
    default:
      return status.isPackaged ? "Not checked yet" : "Dev build — check only";
  }
}

export function SettingsYarkUpdateSection(props: Props): ReactElement {
  const [status, setStatus] = useState<AppUpdateStatus>(() =>
    createIdleAppUpdateStatus(props.appVersion, true),
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.getAppUpdateStatus();
      if (cancelled || !result.ok) return;
      setStatus(result.data);
    })();
    const unsubscribe = window.api.onAppUpdate((next) => {
      setStatus(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (props.focusSection !== true) return;
    const el = document.getElementById("settings-yark-updates");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    props.onFocused?.();
  }, [props.focusSection, props.onFocused]);

  const runCheck = async () => {
    setActionBusy(true);
    setActionError(null);
    setStatus((prev) => ({
      ...prev,
      phase: "checking",
      error: null,
      percent: null,
    }));
    try {
      const result = await window.api.checkForAppUpdate();
      if (!result.ok) {
        setActionError(result.error ?? "Could not check for YARK updates");
        setStatus((prev) => ({
          ...prev,
          phase: "error",
          error: result.error ?? "Could not check for YARK updates",
        }));
        return;
      }
      setStatus(result.data);
    } finally {
      setActionBusy(false);
    }
  };

  const runDownload = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await window.api.downloadAppUpdate();
      if (!result.ok) {
        setActionError(result.error ?? "Could not download the YARK update");
        return;
      }
      setStatus(result.data);
    } finally {
      setActionBusy(false);
    }
  };

  const runInstall = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await window.api.installAppUpdate();
      if (!result.ok) {
        setActionError(result.error ?? "Could not install the YARK update");
      }
    } finally {
      setActionBusy(false);
    }
  };

  const openNotes = async () => {
    setActionError(null);
    const result = await window.api.openYarkReleaseNotes();
    if (!result.ok) {
      setActionError(result.error ?? "Could not open release notes");
    }
  };

  const checking = status.phase === "checking" || actionBusy;
  const showDownload =
    status.isPackaged
    && (status.phase === "available" || status.phase === "downloading");
  const canDownload = status.phase === "available" && !actionBusy;
  const canInstall =
    status.isPackaged
    && status.phase === "ready"
    && status.installBlockedReason === null
    && !actionBusy;
  const showProgress = status.phase === "downloading" && status.percent !== null;

  return (
    <section
      className={classes.section}
      aria-labelledby="settings-yark-updates"
      data-settings-yark-updates
    >
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        <Group gap="xs" align="baseline" wrap="wrap" className={classes.settingCopy}>
          <Title order={3} size="h4" id="settings-yark-updates">
            YARK updates
          </Title>
          <Text size="xs" c="dimmed" data-yark-update-status>
            v{props.appVersion} · {statusLabel(status)}
          </Text>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<ArrowClockwise size={14} />}
            loading={status.phase === "checking"}
            disabled={checking && status.phase !== "checking"}
            onClick={() => void runCheck()}
            data-yark-update-check
          >
            Check now
          </Button>
          {showDownload && (
            <Button
              size="compact-xs"
              leftSection={<CloudArrowDown size={14} />}
              disabled={!canDownload && status.phase !== "downloading"}
              loading={status.phase === "downloading"}
              onClick={() => void runDownload()}
              data-yark-update-download
            >
              Download
            </Button>
          )}
          {status.isPackaged && status.phase === "ready" && (
            <Button
              size="compact-xs"
              color="teal"
              disabled={!canInstall}
              loading={actionBusy}
              onClick={() => void runInstall()}
              data-yark-update-install
            >
              Restart and install
            </Button>
          )}
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<ArrowSquareOut size={14} />}
            onClick={() => void openNotes()}
            data-yark-update-notes
          >
            Release notes
          </Button>
        </Group>
      </Group>

      {showProgress && (
        <Progress value={status.percent ?? 0} size="sm" aria-label="Download progress" />
      )}

      {status.phase === "ready"
        && status.installBlockedReason !== null
        && status.installBlockedMessage !== null && (
        <Text size="xs" c="orange" data-yark-update-blocked>
          {status.installBlockedMessage}
        </Text>
      )}

      {(actionError !== null
        || (status.phase === "error" && status.error !== null)) && (
        <Text size="xs" c="red" data-yark-update-error>
          {actionError ?? status.error}
        </Text>
      )}
    </section>
  );
}
