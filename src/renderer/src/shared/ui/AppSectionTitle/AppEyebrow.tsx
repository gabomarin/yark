import type { ReactElement, ReactNode } from "react";
import classes from "./AppSectionTitle.module.css";

interface Props {
  children: ReactNode;
}

/**
 * Uppercase section label above a group of rows or a card (#PUX-004). Replaces
 * the feature-local `.groupTitle` / `.sectionLabel` classes that each picked
 * their own size, weight and letter-spacing.
 */
export function AppEyebrow(props: Props): ReactElement {
  return <p className={classes.eyebrow}>{props.children}</p>;
}
