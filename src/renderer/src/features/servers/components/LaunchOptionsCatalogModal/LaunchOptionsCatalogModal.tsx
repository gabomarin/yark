import type { ReactElement } from "react";
import { Anchor } from "@mantine/core";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import { useUiDensity } from "@app/AppProviders";
import { asaLaunchOptionsCatalog } from "@shared/asa/asa-launch-options-catalog";
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
    <AppPanelModal
      opened={props.opened}
      onClose={props.onClose}
      title="ASA launch-options catalog"
      size={1200}
      centered={false}
      height="min(84vh, 820px)"
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
    </AppPanelModal>
  );
}
