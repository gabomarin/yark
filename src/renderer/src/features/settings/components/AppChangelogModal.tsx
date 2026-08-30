import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import {
  Accordion,
  Button,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Text,
} from "@mantine/core";
import {
  getChangelogForVersion,
  getRecentChangelog,
  type ChangelogEntry,
} from "@shared/changelog";
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
    <Modal.Root
      opened={props.opened}
      onClose={handleClose}
      centered
      size={672}
      radius="md"
      classNames={{
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay backgroundOpacity={0.5} color="#000" />
      <Modal.Content radius="md">
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title data-changelog-modal-title>
                What&apos;s new
              </Modal.Title>
              <Text size="xs" className={classes.meta}>
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
              </Text>
            </div>
            <Modal.CloseButton aria-label="Close" />
          </div>
          <SegmentedControl
            size="xs"
            radius="sm"
            fullWidth
            value={tab}
            onChange={(value) => setTab(value as AppChangelogTab)}
            data={[
              { label: "This version", value: "current" },
              { label: "Earlier releases", value: "recent" },
            ]}
            className={classes.tabs}
            data-changelog-tab
          />
        </Modal.Header>

        <Modal.Body data-changelog-modal>
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

          <div className={classes.footer}>
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
            <Button size="compact-xs" radius="md" onClick={handleClose} data-changelog-got-it>
              Got it
            </Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
