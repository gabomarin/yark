import type { ReactElement, ReactNode } from "react";
import { Group } from "@mantine/core";
import classes from "./AppPageHeader.module.css";

interface Props {
  title: string;
  /** Optional one-line lede under the title — never a restatement of the nav item. */
  subtitle?: string;
  /** Right-aligned actions (buttons). Wrap the set, not each button. */
  actions?: ReactNode;
  /** Page-specific spacing only; the title/action chrome lives here. */
  className?: string;
}

/**
 * Tool-pane page header: title and actions **inside** the chrome shell (#PUX-004).
 * One implementation for every page — do not re-declare a `.pageTitle` per feature.
 */
export function AppPageHeader(props: Props): ReactElement {
  return (
    <Group
      component="header"
      justify="space-between"
      align={props.subtitle === undefined ? "center" : "flex-start"}
      wrap="wrap"
      gap="sm"
      className={[classes.header, props.className].filter(Boolean).join(" ")}
    >
      <div>
        <h1 className={classes.title}>{props.title}</h1>
        {props.subtitle !== undefined && (
          <p className={classes.subtitle}>{props.subtitle}</p>
        )}
      </div>
      {props.actions !== undefined && <Group gap="sm">{props.actions}</Group>}
    </Group>
  );
}
