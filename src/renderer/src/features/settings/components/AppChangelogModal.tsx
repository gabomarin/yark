import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import {
  Button,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import {
  getChangelogForVersion,
  getRecentChangelog,
  type ChangelogEntry,
} from "@shared/changelog";
import { AppChangelogList } from "./AppChangelogList";

export type AppChangelogTab = "current" | "recent";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Installed / highlighted app version (no required `v` prefix). */
  appVersion: string;
  /** Initial tab when opened (post-update uses `current`). */
  initialTab?: AppChangelogTab;
  /** Optional override list (tests). Defaults to shared curated changelog. */
  entries?: readonly ChangelogEntry[];
  /** Persist “seen” when the operator dismisses (Got it / close). */
  onDismiss?: () => void;
}

export function AppChangelogModal(props: Props): ReactElement {
  const initialTab = props.initialTab ?? "current";
  const [tab, setTab] = useState<AppChangelogTab>(initialTab);

  useEffect(() => {
    if (props.opened) {
      setTab(initialTab);
    }
  }, [props.opened, initialTab]);

  const source = props.entries;
  const current = getChangelogForVersion(props.appVersion, source);
  const recent = getRecentChangelog(undefined, source);
  const title =
    tab === "current"
      ? `What's new in v${props.appVersion.replace(/^v/i, "")}`
      : "Changelog";
  const subtitle =
    tab === "current"
      ? "Shown once after you install this YARK version."
      : "Curated notes bundled with the app (offline).";

  const handleClose = () => {
    props.onDismiss?.();
    props.onClose();
  };

  const openGitHub = () => {
    void window.api.openYarkReleaseNotes();
  };

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title={
        <Stack gap={4}>
          <Text fw={600} size="sm" data-changelog-modal-title>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </Stack>
      }
      size="md"
      centered
      radius="lg"
      padding="md"
    >
      <Stack gap="md" data-changelog-modal>
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(value) => setTab(value as AppChangelogTab)}
          data={[
            { label: "This version", value: "current" },
            { label: "Recent", value: "recent" },
          ]}
          data-changelog-tab
        />

        <ScrollArea.Autosize mah={360} type="auto" offsetScrollbars>
          {tab === "current" ? (
            current !== null ? (
              <AppChangelogList entries={[current]} compact />
            ) : (
              <Text size="xs" c="dimmed">
                No curated notes for v{props.appVersion} yet.
              </Text>
            )
          ) : recent.length > 0 ? (
            <AppChangelogList entries={recent} />
          ) : (
            <Text size="xs" c="dimmed">
              No curated release notes available.
            </Text>
          )}
        </ScrollArea.Autosize>

        <Group justify="space-between" gap="xs" wrap="wrap">
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<ArrowSquareOut size={14} />}
            onClick={() => void openGitHub()}
            data-changelog-github
          >
            Full notes on GitHub
          </Button>
          <Group gap="xs">
            {tab === "current" && (
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => setTab("recent")}
                data-changelog-browse-recent
              >
                Browse recent
              </Button>
            )}
            <Button
              size="compact-xs"
              onClick={handleClose}
              data-changelog-got-it
            >
              Got it
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
