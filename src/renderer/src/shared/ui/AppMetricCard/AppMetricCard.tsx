import { Card, RingProgress, Text } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import classes from "./AppMetricCard.module.css";

export type AppMetricTone = "default" | "warning" | "danger";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: AppMetricTone;
  /** Highlight when used as a toggle filter. */
  active?: boolean;
  onClick?: () => void;
  /**
   * Optional 0–100 ring (e.g. disk used %). Omitted when null/undefined.
   */
  progressPercent?: number | null;
  className?: string;
};

function ringColor(tone: AppMetricTone): string {
  if (tone === "danger") return "var(--mantine-color-red-6)";
  if (tone === "warning") return "var(--mantine-color-yellow-6)";
  return "var(--ark-blue-7)";
}

/**
 * Compact scalar metric tile for fleet strips (Backups health, etc.).
 * Prefer this over feature-local StatCard clones.
 */
export function AppMetricCard(props: Props): ReactElement {
  const {
    label,
    value,
    hint,
    icon,
    tone = "default",
    active = false,
    onClick,
    progressPercent = null,
    className,
  } = props;

  const showRing =
    typeof progressPercent === "number" &&
    Number.isFinite(progressPercent) &&
    progressPercent >= 0;

  const classNames = [classes.root, className]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");

  const clickable = onClick !== undefined;

  return (
    <Card
      component={clickable ? "button" : "div"}
      type={clickable ? "button" : undefined}
      withBorder
      padding="sm"
      radius="md"
      className={classNames}
      onClick={onClick}
      data-tone={tone === "default" ? undefined : tone}
      data-active={active || undefined}
      data-clickable={clickable || undefined}
    >
      <Text
        size="xs"
        c={active ? undefined : "dimmed"}
        fw={700}
        className={classes.label}
      >
        {icon}
        <span>{label}</span>
      </Text>
      <div className={classes.valueRow}>
        <Text className={classes.value}>{value}</Text>
        {showRing && (
          <RingProgress
            size={36}
            thickness={4}
            roundCaps
            sections={[{ value: Math.min(100, progressPercent), color: ringColor(tone) }]}
            aria-hidden
          />
        )}
      </div>
      {hint !== undefined && (
        <Text size="xs" c="dimmed" className={classes.hint}>
          {hint}
        </Text>
      )}
    </Card>
  );
}
