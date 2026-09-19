import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import {
  Accordion,
  Button,
  Group,
  ScrollArea,
  SegmentedControl,
  Text,
} from "@mantine/core";
import {
  getChangelogForVersion,
  getRecentChangelog,
  type ChangelogEntry,
} from "@shared/settings/changelog";
import {
  changelogNoteCount,
  changelogNoteCountLabel,
  formatChangelogDate,
} from "@features/settings/model/changelogViewModel";
import { AppChangelogList } from "./AppChangelogList";
import classes from "./AppChangelog.module.css";

type AppChangelogTab = "current" | "recent";

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
  const [openVersion, setOpenVersion] = useState<string | null>(null);

  const source = props.entries;
  const versionLabel = props.appVersion.replace(/^v/i, "");
  const current = getChangelogForVersion(props.appVersion, source);
  const recent = getRecentChangelog(undefined, source);
  const newestVersion = recent[0]?.version ?? null;
  const headerDate =
    current !== null ? formatChangelogDate(current.date) : null;

  useEffect(() => {
    if (!props.opened) {
      return;
    }
    setTab(initialTab);
    setOpenVersion(newestVersion);
  }, [props.opened, initialTab, newestVersion]);

  const handleClose = () => {
    props.onDismiss?.();
    props.onClose();
  };

  return (
    <AppPanelModal
      opened={props.opened}
      onClose={handleClose}
      size="lg"
      data-changelog-modal
      title={<span data-changelog-modal-title>What&apos;s new</span>}
      meta={
        <>
          v{versionLabel}
          {headerDate !== null && (
            <>
              <span className={classes.metaSep} aria-hidden>
                ·
              </span>
              <Text size="xs" component="time" inherit>
                {headerDate}
              </Text>
            </>
          )}
        </>
      }
      headerExtra={
        <SegmentedControl
          size="xs"
          fullWidth
          value={tab}
          onChange={(value) => setTab(value as AppChangelogTab)}
          data={[
            { label: "This version", value: "current" },
            { label: "Earlier releases", value: "recent" },
          ]}
          data-changelog-tab
        />
      }
      footer={
        <>
          <Button
            size="compact-xs"
            variant="subtle"
            className={classes.github}
            rightSection={<ArrowSquareOut size={12} />}
            onClick={() => {
              void window.api.openYarkReleaseNotes();
            }}
            data-changelog-github
          >
            Full notes on GitHub
          </Button>
          <Button size="compact-xs" onClick={handleClose} data-changelog-got-it>
            Got it
          </Button>
        </>
      }
    >
      <ScrollArea.Autosize
        mah={480}
        type="auto"
        offsetScrollbars
        className={classes.scroll}
        classNames={{ viewport: classes.scrollViewport }}
      >
            {tab === "current" ? (
              current !== null ? (
                <AppChangelogList entries={[current]} />
              ) : (
                <Text size="sm" className={classes.empty}>
                  No curated notes for v{versionLabel} yet.
                </Text>
              )
            ) : recent.length > 0 ? (
              <Accordion
                chevronPosition="right"
                chevronSize={12}
                transitionDuration={0}
                value={openVersion}
                onChange={setOpenVersion}
                className={classes.accordion}
                classNames={{
                  item: classes.accordionItem,
                  control: classes.accordionControl,
                  panel: classes.accordionPanel,
                }}
              >
                {recent.map((entry) => (
                  <Accordion.Item key={entry.version} value={entry.version}>
                    <Accordion.Control>
                      <Group justify="space-between" gap="sm" wrap="nowrap">
                        <Text size="sm" fw={openVersion === entry.version ? 600 : 500} span>
                          v{entry.version}
                        </Text>
                        <Text size="xs" className={classes.accordionMeta} span>
                          {`${formatChangelogDate(entry.date)} · ${changelogNoteCountLabel(changelogNoteCount(entry))}`}
                        </Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <AppChangelogList entries={[entry]} />
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            ) : (
              <Text size="sm" className={classes.empty}>
                No curated release notes available.
              </Text>
            )}
      </ScrollArea.Autosize>
    </AppPanelModal>
  );
}
