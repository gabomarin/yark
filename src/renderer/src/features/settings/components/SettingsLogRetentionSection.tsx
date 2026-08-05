import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Broom } from "@phosphor-icons/react";
import {
  Button,
  NumberInput,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import type {
  LogCleanupPreview,
  LogCleanupTargetRef,
  LogRetentionSettings,
} from "@shared/types";
import { DEFAULT_LOG_RETENTION_SETTINGS } from "@shared/log-retention";
import { LogRetentionCleanupModal } from "./LogRetentionCleanupModal";
import classes from "../SettingsPage.module.css";

function withValidFailureDays(settings: LogRetentionSettings): LogRetentionSettings {
  return {
    ...settings,
    eventsFailureRetainDays: Math.max(
      settings.eventsRetainDays,
      settings.eventsFailureRetainDays,
    ),
  };
}

export function SettingsLogRetentionSection(): ReactElement {
  const [settings, setSettings] = useState<LogRetentionSettings>({
    ...DEFAULT_LOG_RETENTION_SETTINGS,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<LogCleanupPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.getLogRetentionSettings();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? "Could not load log retention settings");
        setReady(true);
        return;
      }
      setSettings(result.data);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: LogRetentionSettings, previous: LogRetentionSettings) => {
    const coerced = withValidFailureDays(next);
    setSettings(coerced);
    setBusy(true);
    setError(null);
    void (async () => {
      const result = await window.api.setLogRetentionSettings(coerced);
      setBusy(false);
      if (!result.ok) {
        setSettings(previous);
        setError(result.error ?? "Could not update log retention settings");
        return;
      }
      setSettings(result.data);
    })();
  };

  const openCleanup = () => {
    setCleanupPreview(null);
    setCleanupOpen(true);
    setError(null);
    setInfo(null);
  };

  const previewCleanup = async () => {
    setCleanupBusy(true);
    setError(null);
    const result = await window.api.previewLogCleanup({});
    setCleanupBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not scan for cleanup");
      setCleanupPreview(null);
      return;
    }
    setCleanupPreview(result.data);
  };

  const runCleanup = async () => {
    if (cleanupPreview === null || cleanupPreview.items.length === 0) return;
    setCleanupBusy(true);
    setError(null);
    const confirmedTargets: LogCleanupTargetRef[] = cleanupPreview.items.map((item) => ({
      category: item.category,
      serverId: item.serverId,
      targetKey: item.targetKey,
    }));
    const result = await window.api.runLogCleanup({ confirmedTargets });
    setCleanupBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not run cleanup");
      return;
    }
    setCleanupOpen(false);
    setCleanupPreview(null);
    const skipped = result.data.skipped.length;
    const failed = result.data.failed.length;
    const parts = [
      `Removed ${result.data.deleted} item${result.data.deleted === 1 ? "" : "s"}`,
      result.data.freedBytes > 0 ? `${result.data.freedBytes} bytes freed` : null,
    ].filter((part): part is string => part !== null);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (failed > 0) parts.push(`${failed} failed`);
    setInfo(`Cleanup finished: ${parts.join(" · ")}.`);
  };

  return (
    <section className={classes.section} aria-labelledby="settings-log-retention">
      <Title order={3} size="h4" id="settings-log-retention">
        Log retention
      </Title>
      <Text size="xs" c="dimmed">
        How long YARK keeps its own activity history and update logs. Game console
        logs on disk are never deleted; backups are managed under Backups.
      </Text>

      {(error !== null || info !== null) && (
        <Text size="xs" c={error !== null ? "red" : "dimmed"}>
          {error ?? info}
        </Text>
      )}

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Everyday activity history</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Days to keep normal “all went fine” events.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <NumberInput
            min={7}
            max={3650}
            value={settings.eventsRetainDays}
            disabled={!ready || busy}
            onChange={(value) => {
              if (typeof value !== "number") return;
              persist(
                { ...settings, eventsRetainDays: value },
                settings,
              );
            }}
            w={100}
            aria-label="Keep everyday activity history for days"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Problem history</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Days to keep warnings, crashes, and failed updates.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <NumberInput
            min={7}
            max={3650}
            value={settings.eventsFailureRetainDays}
            disabled={!ready || busy}
            onChange={(value) => {
              if (typeof value !== "number") return;
              persist(
                { ...settings, eventsFailureRetainDays: value },
                settings,
              );
            }}
            w={100}
            aria-label="Keep problem history for days"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Successful update logs</Text>
          <Text size="xs" c="dimmed" mt={2}>
            How many recent successful update logs to keep per server.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <NumberInput
            min={1}
            max={200}
            value={settings.updateLogsRetainCount}
            disabled={!ready || busy}
            onChange={(value) => {
              if (typeof value !== "number") return;
              persist(
                { ...settings, updateLogsRetainCount: value },
                settings,
              );
            }}
            w={100}
            aria-label="Keep successful update logs count"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Failed update logs</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Days to keep failed update logs.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <NumberInput
            min={7}
            max={3650}
            value={settings.updateLogsFailureRetainDays}
            disabled={!ready || busy}
            onChange={(value) => {
              if (typeof value !== "number") return;
              persist(
                { ...settings, updateLogsFailureRetainDays: value },
                settings,
              );
            }}
            w={100}
            aria-label="Keep failed update logs for days"
          />
        </div>
      </div>

      <div className={classes.settingRow}>
        <div className={classes.settingCopy}>
          <Text size="sm" fw={600}>Clean up automatically</Text>
          <Text size="xs" c="dimmed" mt={2}>
            Remove outdated history after launch and about once a day.
          </Text>
        </div>
        <div className={classes.settingControl}>
          <Switch
            checked={settings.autoCleanupEnabled}
            disabled={!ready || busy}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              persist(
                { ...settings, autoCleanupEnabled: enabled },
                settings,
              );
            }}
            aria-label="Clean up logs automatically"
          />
        </div>
      </div>

      <Button
        size="compact-sm"
        variant="light"
        leftSection={<Broom size={14} />}
        disabled={!ready || busy}
        onClick={openCleanup}
      >
        Clean up now…
      </Button>

      <LogRetentionCleanupModal
        opened={cleanupOpen}
        busy={cleanupBusy}
        preview={cleanupPreview}
        onClose={() => setCleanupOpen(false)}
        onScan={() => void previewCleanup()}
        onConfirm={() => void runCleanup()}
      />
    </section>
  );
}
