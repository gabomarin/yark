import type { ReactElement } from "react";
import { Alert as MantineAlert, type AlertProps } from "@mantine/core";
import {
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { alertToneForColor } from "@theme/theme";

/** Severity glyph per tone, mirroring the theme's `alertToneForColor`. */
const TONE_ICONS = {
  message: Info,
  success: CheckCircle,
  warn: Warning,
  error: WarningCircle,
} as const;

/**
 * Mantine `Alert` carrying the app's severity icon for its tone, so an alert says what it
 * is at a glance. The theme colours the icon through `--alert-icon-color`; this atom only
 * picks the glyph and the tone is derived from `color`, so call sites stay one tag.
 *
 * Pass `icon={null}` to opt out, or your own node to override it.
 */
export function AppAlert({ icon, color, ...rest }: AlertProps): ReactElement {
  const tone = alertToneForColor(typeof color === "string" ? color : "blue");
  const ToneIcon = tone === "default" ? null : TONE_ICONS[tone];
  return (
    <MantineAlert
      color={color}
      icon={icon === undefined && ToneIcon !== null ? <ToneIcon size={16} /> : icon}
      {...rest}
    />
  );
}
