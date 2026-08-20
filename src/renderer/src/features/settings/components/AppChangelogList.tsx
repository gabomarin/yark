import type { ReactElement } from "react";
import { Badge, Stack, Text } from "@mantine/core";
import type { ChangelogEntry, ChangelogSection } from "@shared/changelog";
import classes from "./AppChangelog.module.css";

function sectionBadgeColor(
  title: string,
): "blue" | "yellow" | "teal" | "red" | "gray" {
  switch (title) {
    case "Added":
      return "blue";
    case "Changed":
      return "yellow";
    case "Fixed":
      return "teal";
    case "Security":
      return "red";
    default:
      return "gray";
  }
}

function SectionBlock(props: { section: ChangelogSection }): ReactElement {
  return (
    <Stack gap="xs">
      <Badge
        size="xs"
        variant="light"
        color={sectionBadgeColor(props.section.title)}
        tt="uppercase"
      >
        {props.section.title}
      </Badge>
      <ul className={classes.itemList}>
        {props.section.items.map((item) => (
          <li key={item} className={classes.item}>
            <span className={classes.itemDot} aria-hidden />
            <Text size="xs" component="span">
              {item}
            </Text>
          </li>
        ))}
      </ul>
    </Stack>
  );
}

interface EntryProps {
  entry: ChangelogEntry;
  /** When true, omit the bottom rule used between Recent entries. */
  compact?: boolean;
}

function AppChangelogEntryBlock(props: EntryProps): ReactElement {
  return (
    <article
      className={props.compact === true ? classes.entryCompact : classes.entry}
      data-changelog-version={props.entry.version}
    >
      <header className={classes.entryHeader}>
        <Text size="sm" fw={600}>
          v{props.entry.version}
        </Text>
        <Text size="xs" c="dimmed" component="time">
          {props.entry.date}
        </Text>
      </header>
      <Stack gap="sm">
        {props.entry.sections.map((section) => (
          <SectionBlock key={section.title} section={section} />
        ))}
      </Stack>
    </article>
  );
}

interface ListProps {
  entries: readonly ChangelogEntry[];
  compact?: boolean;
}

export function AppChangelogList(props: ListProps): ReactElement {
  return (
    <Stack gap="md" data-changelog-list>
      {props.entries.map((entry) => (
        <AppChangelogEntryBlock
          key={entry.version}
          entry={entry}
          compact={props.compact}
        />
      ))}
    </Stack>
  );
}
