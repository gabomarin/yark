import type { ReactElement } from "react";
import { Button, Text } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { previewBinaryPath } from "./serverLaunchModel";
import classes from "./ServerLaunchPanel.module.css";

interface Props {
  installDir: string;
  useAsaApi?: boolean;
  useAsaApiLoader?: boolean;
  inputSize: "xs" | "sm";
  open: boolean;
  onToggle: () => void;
  yark: string[];
  structured: string[];
  raw: string[];
  cautionTokens: ReadonlySet<string>;
}

export function ServerLaunchPreview(props: Props): ReactElement {
  return (
    <div>
      <Button
        variant="subtle"
        size={props.inputSize}
        onClick={props.onToggle}
      >
        {props.open ? "Hide" : "Show"} effective command preview
      </Button>
      {props.open ? (
        <AppSurfaceCard tone="flat" radius={0}>
          <Text size="xs" c="dimmed" mb={6} data-testid="launch-preview-legend">
            <span className={classes.previewYark}>YARK-owned</span>
            {" · "}
            <span className={classes.previewStructured}>Structured</span>
            {" · "}
            <span className={classes.previewCaution}>Caution</span>
            {" · "}
            <span className={classes.previewRaw}>Raw</span>
          </Text>
          <code className={classes.previewCode}>
            <span className={classes.previewRaw}>
              &quot;{previewBinaryPath(props.installDir, {
                useAsaApi: props.useAsaApi,
                useAsaApiLoader: props.useAsaApiLoader,
              })}&quot;{" "}
            </span>
            {props.yark.map((t) => (
              <span key={`y-${t}`} className={classes.previewYark}>
                {t}{" "}
              </span>
            ))}
            {props.structured.map((t, i) => (
              <span
                key={`s-${t}-${i}`}
                className={
                  props.cautionTokens.has(t)
                    ? classes.previewCaution
                    : classes.previewStructured
                }
              >
                {t}{" "}
              </span>
            ))}
            {props.raw.map((t) => (
              <span key={`r-${t}`} className={classes.previewRaw}>
                {t}{" "}
              </span>
            ))}
          </code>
        </AppSurfaceCard>
      ) : null}
    </div>
  );
}
