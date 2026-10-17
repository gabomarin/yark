import { useEffect, useId, useState, type ReactElement } from "react";
import { Anchor, Button, Group, Popover, Stack, Text } from "@mantine/core";
import type { IniDiffEntry, ServerIniPayload } from "@shared/types";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import {
  EXTERNAL_INI_DIFF_PREVIEW_LIMIT,
  formatExternalIniChangeSummary,
  formatIniDiffChangeLabel,
  summarizeExternalIniDiff,
} from "./configurationEditorExternalDiff";
import classes from "./ConfigurationEditorStatusAlerts.module.css";

interface Props {
  error: string | null;
  onDismissError: () => void;
  /** Save lost a race with an external INI edit (#665 / #667). */
  staleDocument?: boolean;
  /** Disk/pending changed while the editor has unsaved edits (#665). */
  externalChangeDetected?: boolean;
  /** Visual Save can merge non-overlapping edits; Raw/text still needs Reload (#667). */
  iniMode?: "visual" | "text";
  /** Editor baseline (load / last save) for outside-change summaries (#667). */
  baseline?: ServerIniPayload | null;
  /** Disk/pending payload captured when external change was detected (#667). */
  externalDiskPayload?: ServerIniPayload | null;
  onReloadStale?: () => void;
  onDismissExternalChange?: () => void;
  reloadBusy?: boolean;
  serverActive: boolean;
  filesJobActive: boolean;
  /** Durable draft queued until the process stops (#530). */
  pendingQueued: boolean;
}

function ReloadFromDiskButton(props: { busy: boolean; onClick?: () => void }): ReactElement | null {
  if (props.onClick === undefined) {
    return null;
  }
  return (
    <Group gap="xs">
      <Button variant="default" size="compact-sm" loading={props.busy} onClick={props.onClick}>
        Reload from disk
      </Button>
    </Group>
  );
}

function OutsideChangesPopover(props: {
  entries: IniDiffEntry[];
  changedCount: number;
  /** Match the host alert tone (info vs attention). */
  tone: "blue" | "attention";
}): ReactElement | null {
  const [opened, setOpened] = useState(false);
  const dropdownId = useId();

  useEffect(() => {
    if (!opened) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpened(false);
    };
    // Capture so Escape closes the popover even when an Alert/modal parent also listens.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [opened]);

  if (props.changedCount <= 0) {
    return null;
  }
  const visible = props.entries.slice(0, EXTERNAL_INI_DIFF_PREVIEW_LIMIT);
  const remaining = props.changedCount - visible.length;
  const labelColor = props.tone === "attention" ? "attention.6" : "blue.6";
  return (
    <Popover
      width={340}
      position="bottom-start"
      shadow="md"
      withinPortal
      opened={opened}
      onChange={setOpened}
      closeOnEscape
      closeOnClickOutside
    >
      <Popover.Target>
        <Anchor
          component="button"
          type="button"
          size="sm"
          className={classes.detailLink}
          data-external-ini-change-count={props.changedCount}
          aria-expanded={opened}
          aria-controls={dropdownId}
          aria-haspopup="dialog"
          onClick={() => {
            setOpened((prev) => !prev);
          }}
        >
          View outside changes
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown
        id={dropdownId}
        role="region"
        aria-label="Outside INI changes"
        className={classes.dropdown}
        data-external-ini-changes
      >
        <Stack gap="xs" className={classes.changeList}>
          {visible.map((entry) => (
            <div
              key={`${entry.fileKey}.${entry.section}.${entry.key}.${entry.occurrence ?? 0}.${entry.change}`}
              className={classes.changeRow}
              data-external-ini-change={entry.key}
            >
              <Text size="sm" fw={600} className={classes.changeKey}>
                {entry.key}
              </Text>
              <Text size="xs" c={labelColor} fw={600}>
                {formatIniDiffChangeLabel(entry.change)}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {entry.change === "changed"
                  ? `${entry.before ?? "–"} → ${entry.after ?? "–"}`
                  : entry.change === "added"
                    ? (entry.after ?? "–")
                    : (entry.before ?? "–")}
              </Text>
            </div>
          ))}
          {remaining > 0 && (
            <Text size="xs" c="dimmed">
              And {remaining} more…
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function SaveErrorAlert(props: {
  error: string;
  staleDocument: boolean;
  reloadBusy: boolean;
  onDismiss: () => void;
  onReload?: () => void;
}): ReactElement {
  if (!props.staleDocument) {
    return (
      <AppAlert color="red" mb="sm" onClose={props.onDismiss} withCloseButton>
        {props.error}
      </AppAlert>
    );
  }
  return (
    <AppAlert color="red" mb="sm" title="INI conflict" onClose={props.onDismiss} withCloseButton>
      <Stack gap="xs">
        <Text size="sm">{props.error}</Text>
        <ReloadFromDiskButton busy={props.reloadBusy} onClick={props.onReload} />
      </Stack>
    </AppAlert>
  );
}

function ExternalChangeAlert(props: {
  iniMode: "visual" | "text";
  reloadBusy: boolean;
  baseline: ServerIniPayload | null;
  externalDiskPayload: ServerIniPayload | null;
  onDismiss?: () => void;
  onReload?: () => void;
}): ReactElement {
  const { entries, changedCount } = summarizeExternalIniDiff(props.baseline, props.externalDiskPayload);
  const summary = formatExternalIniChangeSummary(changedCount);
  const detail = (
    <OutsideChangesPopover
      entries={entries}
      changedCount={changedCount}
      tone={props.iniMode === "visual" ? "blue" : "attention"}
    />
  );

  if (props.iniMode === "visual") {
    // No Reload CTA here — Save merges non-overlapping edits; Reload stays in the toolbar (#667).
    return (
      <AppAlert color="blue" mb="sm" title="INI updated outside YARK" onClose={props.onDismiss} withCloseButton>
        <Stack gap={4}>
          <Text size="sm">{summary} Click Save to merge your changes with theirs when they do not overlap.</Text>
          {detail}
        </Stack>
      </AppAlert>
    );
  }
  return (
    <AppAlert color="attention" mb="sm" title="INI changed outside YARK" onClose={props.onDismiss} withCloseButton>
      <Stack gap="xs">
        <Stack gap={4}>
          <Text size="sm">
            {summary} Reload to see those edits, or keep editing — Save in text mode will refuse to overwrite them until
            you reload.
          </Text>
          {detail}
        </Stack>
        <ReloadFromDiskButton busy={props.reloadBusy} onClick={props.onReload} />
      </Stack>
    </AppAlert>
  );
}

export function ConfigurationEditorStatusAlerts(props: Props): ReactElement | null {
  const {
    error,
    onDismissError,
    staleDocument = false,
    externalChangeDetected = false,
    iniMode = "visual",
    baseline = null,
    externalDiskPayload = null,
    onReloadStale,
    onDismissExternalChange,
    reloadBusy = false,
    serverActive,
    filesJobActive,
    pendingQueued,
  } = props;

  if (error === null && !externalChangeDetected && !serverActive && !pendingQueued) {
    return null;
  }

  return (
    <>
      {error !== null && (
        <SaveErrorAlert
          error={error}
          staleDocument={staleDocument}
          reloadBusy={reloadBusy}
          onDismiss={onDismissError}
          onReload={onReloadStale}
        />
      )}
      {externalChangeDetected && error === null && (
        <ExternalChangeAlert
          iniMode={iniMode}
          reloadBusy={reloadBusy}
          baseline={baseline}
          externalDiskPayload={externalDiskPayload}
          onDismiss={onDismissExternalChange}
          onReload={onReloadStale}
        />
      )}
      {pendingQueued && (
        <AppAlert color="attention" mb="sm" title="INI queued">
          Your saved draft is waiting. YARK will write it to the install when the server stops (or before the next
          start). Open in editor shows the live files, which may still be outdated.
        </AppAlert>
      )}
      {serverActive && !filesJobActive && !pendingQueued && (
        <AppAlert color="attention" mb="sm" title="Server is running">
          Saving queues your changes until the server stops — ASA may overwrite live INI files while it is running.
        </AppAlert>
      )}
    </>
  );
}
