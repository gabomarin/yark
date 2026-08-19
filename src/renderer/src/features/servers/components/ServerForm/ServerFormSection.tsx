import type { ReactElement, ReactNode } from "react";
import { Stack, Text, Title } from "@mantine/core";
import {
  AppSurfaceCard,
  type AppSurfaceTone,
} from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./ServerForm.module.css";

interface Props {
  title?: string;
  /** Optional meta above the title (create Identity / Reachability). */
  eyebrow?: string;
  children: ReactNode;
  /** Embedded edit: flat stack. Page: AppSurfaceCard tone. */
  flat?: boolean;
  tone?: AppSurfaceTone;
  fill?: boolean;
  span2?: boolean;
  padding?: "sm" | "md";
}

export function ServerFormSection({
  title,
  eyebrow,
  children,
  flat = false,
  tone = "cool",
  fill = false,
  span2 = false,
  padding = "md",
}: Props): ReactElement {
  const spanClass = span2 ? classes.span2 : undefined;
  const eyebrowNode =
    eyebrow !== undefined ? (
      <Text fz={11} c="dimmed" tt="uppercase" lts="0.06em">
        {eyebrow}
      </Text>
    ) : null;

  if (flat) {
    return (
      <Stack gap="xs" className={spanClass}>
        {eyebrowNode}
        {title !== undefined && (
          <Text fw={600} fz="sm">
            {title}
          </Text>
        )}
        {children}
      </Stack>
    );
  }

  return (
    <AppSurfaceCard
      tone={tone}
      fill={fill}
      padding={padding}
      className={spanClass}
    >
      <Stack gap="sm" className={fill ? classes.sectionFill : undefined}>
        {eyebrowNode}
        {title !== undefined && <Title order={4}>{title}</Title>}
        {children}
      </Stack>
    </AppSurfaceCard>
  );
}
