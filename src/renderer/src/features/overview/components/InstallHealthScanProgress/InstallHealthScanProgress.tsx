import type { CSSProperties, ReactElement } from "react";
import { useEffect } from "react";
import { Text } from "@mantine/core";
import { NavigationProgress, nprogress } from "@mantine/nprogress";
import classes from "./InstallHealthScanProgress.module.css";

/** Matches NavigationProgress `size` so the label sits inside the bar. */
const BAR_SIZE_PX = 22;

interface Props {
  active: boolean;
  /** Short English status shown inside the top progress bar. */
  label?: string;
}

/**
 * Drives Mantine NavigationProgress while the shared install-health scan job runs (#57).
 * Startup and Check installs both feed `active` from the same App-level job.
 */
export function InstallHealthScanProgress({
  active,
  label = "Checking install folders…",
}: Props): ReactElement {
  useEffect(() => {
    if (!active) {
      nprogress.complete();
      return;
    }
    nprogress.start();
    return () => {
      nprogress.complete();
    };
  }, [active]);

  return (
    <>
      <NavigationProgress
        color="blue"
        size={BAR_SIZE_PX}
        className={classes.bar}
        zIndex={10_000}
      />
      {active ? (
        <Text
          size="xs"
          fw={600}
          className={classes.label}
          data-install-health-scan
          role="status"
          aria-live="polite"
          style={{ "--install-scan-bar-size": `${BAR_SIZE_PX}px` } as CSSProperties}
        >
          {label}
        </Text>
      ) : null}
    </>
  );
}
