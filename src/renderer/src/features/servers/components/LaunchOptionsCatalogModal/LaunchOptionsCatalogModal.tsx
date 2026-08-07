import type { ReactElement } from "react";
import { Anchor, Modal } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import { asaLaunchOptionsCatalog } from "@shared/asa-launch-options-catalog";
import { LaunchOptionsCatalogEntriesTab } from "./LaunchOptionsCatalogEntriesTab";
import classes from "./LaunchOptionsCatalogModal.module.css";

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function LaunchOptionsCatalogModal(props: Props): ReactElement {
  const density = useUiDensity();
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="ASA launch-options catalog"
      size={1200}
      classNames={{
        content: classes.modalContent,
        header: classes.modalHeader,
        body: classes.modalBody,
      }}
      styles={{
        content: {
          height: "min(84vh, 820px)",
          maxHeight: "min(84vh, 820px)",
        },
      }}
    >
      <div className={classes.root} data-density={density}>
        <header className={classes.header}>
          <p className={classes.subtitle}>
            ASA command-line metadata from{" "}
            <Anchor
              href={asaLaunchOptionsCatalog.source.url}
              target="_blank"
              rel="noreferrer"
              size="sm"
              className={classes.sourceLink}
              underline="always"
              styles={{
                root: {
                  color:
                    "color-mix(in srgb, var(--app-color-cryo) 50%, white)",
                  "--anchor-color":
                    "color-mix(in srgb, var(--app-color-cryo) 50%, white)",
                  "--anchor-hover-color":
                    "color-mix(in srgb, var(--app-color-cryo) 35%, white)",
                },
              }}
            >
              ark.wiki.gg Command line options
            </Anchor>
            .
          </p>
          <div className={classes.versionCard}>
            <div className={classes.versionLabel}>Catalog version</div>
            <div className={classes.versionValue}>
              {asaLaunchOptionsCatalog.version}
            </div>
          </div>
        </header>

        <LaunchOptionsCatalogEntriesTab inputSize={inputSize} />
      </div>
    </Modal>
  );
}
