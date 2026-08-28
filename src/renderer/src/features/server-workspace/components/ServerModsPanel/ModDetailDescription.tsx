import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";

interface Props {
  text: string;
}

/**
 * Plain-text CurseForge description in the mod detail drawer (#342).
 * No HTML. Clamp + expand so HD / compact density still fits.
 */
export function ModDetailDescription(props: Props): ReactElement {
  const density = useUiDensity();
  const [expanded, setExpanded] = useState(false);
  const clamp = density === "compact" ? 4 : 5;
  const trimmed = props.text.trim();

  useEffect(() => {
    setExpanded(false);
  }, [trimmed]);

  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        Description
      </Text>
      <Text
        size="sm"
        style={{ whiteSpace: "pre-wrap" }}
        lineClamp={expanded ? undefined : clamp}
      >
        {trimmed}
      </Text>
      <Button
        variant="transparent"
        size="compact-xs"
        px={0}
        justify="flex-start"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Show less" : "Show more"}
      </Button>
    </Stack>
  );
}
