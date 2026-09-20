import classes from "./NavSelected.module.css";

/** Compose Fluent selected-nav chrome onto Mantine `NavLink` (needs `data-active`). */
export function navSelectedClassName(...extra: Array<string | undefined>): string {
  return [classes.root, ...extra.filter((item) => item !== undefined && item !== "")].join(" ");
}
