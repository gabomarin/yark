import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import type { ChangelogEntry, ChangelogSection } from "@shared/changelog";
import classes from "./AppChangelog.module.css";

function SectionBlock(props: { section: ChangelogSection }): ReactElement {
  return (
    <section className={classes.section} data-kind={props.section.title}>
      <header className={classes.sectionHeader}>
        <Text size="sm" fw={600} className={classes.sectionTitle}>
          {props.section.title}
        </Text>
        <Text size="xs" c="dimmed" className={classes.sectionCount}>
          {props.section.items.length}
        </Text>
      </header>
      <ul className={classes.itemList}>
        {props.section.items.map((item) => (
          <li key={item} className={classes.item}>
            <span className={classes.itemDot} aria-hidden />
            <Text size="sm" component="p" className={classes.itemText}>
              {item}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ListProps {
  entries: readonly ChangelogEntry[];
}

export function AppChangelogList(props: ListProps): ReactElement {
  return (
    <div className={classes.list} data-changelog-list>
      {props.entries.map((entry) => (
        <article key={entry.version} data-changelog-version={entry.version}>
          <div className={classes.sections}>
            {entry.sections.map((section) => (
              <SectionBlock key={section.title} section={section} />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
