import type { ReactElement } from "react";
import { useState } from "react";
import { Anchor, Text, Textarea } from "@mantine/core";
import { LaunchOptionsCatalogModal } from "../LaunchOptionsCatalogModal/LaunchOptionsCatalogModal";

interface Props {
  value: string;
  inputSize: "xs" | "sm";
  embedded: boolean;
  onChange: (value: string) => void;
}

export function ServerFormExtraArgsField(props: Props): ReactElement {
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <>
      <Textarea
        label="Extra arguments"
        size={props.inputSize}
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        placeholder="-NoBattlEye -ForceAllowCaveFlyers -servergamelog"
        description={
          <Text span size="sm" c="dimmed" component="span">
            {props.embedded
              ? "Space-separated. Appended to the dedicated server launch command. "
              : "Space-separated launch tokens. "}
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={() => setCatalogOpen(true)}
            >
              Browse ASA catalog
            </Anchor>
          </Text>
        }
        minRows={props.embedded ? 3 : 2}
        autosize
        maxRows={8}
      />
      <LaunchOptionsCatalogModal
        opened={catalogOpen}
        onClose={() => setCatalogOpen(false)}
      />
    </>
  );
}
