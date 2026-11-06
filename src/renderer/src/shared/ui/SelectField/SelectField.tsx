import type { ReactElement } from "react";
import { Select, type SelectProps } from "@mantine/core";
import classes from "./SelectField.module.css";

/**
 * Mantine Select with the SearchField leading-icon slot.
 * Toolbar filters share this so the glyph stays centered in the field.
 */
export function SelectField(props: SelectProps): ReactElement {
  return <Select {...props} classNames={{ section: classes.section }} />;
}
