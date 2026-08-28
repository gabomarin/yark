import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import { decodeHtmlEntities } from "@shared/decode-html-entities";

interface Props {
  text: string;
}

/**
 * Plain-text CurseForge description in the mod detail drawer (#342).
 * No HTML render — entities decoded for display. Clamp + expand when needed.
 */
export function ModDetailDescription(props: Props): ReactElement {
  const density = useUiDensity();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const clamp = density === "compact" ? 4 : 5;
  const decoded = decodeHtmlEntities(props.text.trim());

  useEffect(() => {
    setExpanded(false);
  }, [decoded]);

  useLayoutEffect(() => {
    if (expanded) return;
    const node = textRef.current;
    if (node === null) return;
    setCanExpand(node.scrollHeight > node.clientHeight + 1);
  }, [decoded, clamp, density, expanded]);

  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        Description
      </Text>
      <Text
        ref={textRef}
        size="sm"
        style={{ whiteSpace: "pre-wrap" }}
        lineClamp={expanded ? undefined : clamp}
      >
        {decoded}
      </Text>
      {canExpand && (
        <Button
          variant="transparent"
          size="compact-xs"
          px={0}
          justify="flex-start"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </Stack>
  );
}
