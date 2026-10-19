import classes from "./AppSurface.module.css";

/** Tool-page column. Identity is transparent, so the shell keeps painting the pane. */
export const appContentPaneClass = classes.contentPane;

/**
 * Hairline panel vessel (border + fill + raised filter).
 * Only attach where the element already uses that recipe.
 */
export const appRaisedSurfaceClass = classes.raised;

/** Row fill inside a fused list. Hover and selection stay on the feature class. */
export const appFlatRowClass = classes.flatRow;

export function withAppSurface(...parts: Array<string | undefined>): string {
  return parts.filter((item) => item !== undefined && item !== "").join(" ");
}
