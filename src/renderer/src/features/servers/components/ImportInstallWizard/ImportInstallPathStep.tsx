import type { ReactElement } from "react";
import { Alert, Badge, Button, Checkbox, Group, Stack, Text } from "@mantine/core";
import type { ImportInstallProbe } from "@shared/types";
import { PathField } from "@ui/PathField/PathField";
import { healthTone, importHealthBadgeLabel } from "../../importInstallModel";

interface Props {
  installDir: string;
  browsing: boolean;
  probing: boolean;
  probe: ImportInstallProbe | null;
  /** Opt-in to adopt an incomplete ASA tree (#283). */
  allowIncompleteInstall: boolean;
  onAllowIncompleteInstallChange: (value: boolean) => void;
  onInstallDirChange: (value: string) => void;
  onBrowse: () => void;
  /** Apply suggested dedicated root and re-probe. */
  onUseSuggestedDir?: (path: string) => void;
}

export function ImportInstallPathStep(props: Props): ReactElement {
  const activeProbe =
    props.probe !== null && props.probe.installDir === props.installDir.trim()
      ? props.probe
      : null;
  const tone =
    activeProbe !== null ? healthTone(activeProbe) : null;
  const suggested = activeProbe?.suggestedInstallDir ?? null;
  const showIncompleteOptIn =
    activeProbe !== null &&
    activeProbe.alreadyManagedBy === null &&
    !activeProbe.nestedSubfolder &&
    activeProbe.installation.health === "incomplete";

  return (
    <Stack gap="sm">
      <Alert color="blue" title="ASA install folder">
        Select the root that contains <Text span fw={600}>ShooterGame</Text>.
        YARK only creates a profile. ASA files on disk are not modified until Start
        (or Install/Verify for incomplete trees).
      </Alert>
      <PathField
        label="Install folder"
        value={props.installDir}
        placeholder="Select an absolute install path…"
        busy={props.browsing || props.probing}
        onChange={props.onInstallDirChange}
        onBrowse={props.onBrowse}
      />
      {activeProbe !== null && (
        <Stack gap="xs">
          <Group gap="xs" align="flex-start">
            <Badge
              color={tone === "ready" ? "green" : "red"}
              variant="light"
            >
              {importHealthBadgeLabel(activeProbe)}
            </Badge>
            <Text size="sm" c={tone === "ready" ? "dimmed" : "red"}>
              {activeProbe.installation.guidance ||
                (activeProbe.canContinue
                  ? "Installation looks ready."
                  : "This folder is not a ready ASA dedicated root. Pick another folder.")}
            </Text>
          </Group>
          {showIncompleteOptIn ? (
            <Stack gap="xs">
              <Checkbox
                label="Import anyway (Install/Verify before Start)"
                description="Adopt this partial ASA tree as a YARK profile. Start stays blocked until Install or Verify makes the install ready."
                checked={props.allowIncompleteInstall}
                disabled={props.probing || props.browsing}
                onChange={(event) =>
                  props.onAllowIncompleteInstallChange(event.currentTarget.checked)
                }
              />
            </Stack>
          ) : null}
          {activeProbe.installation.health === "empty" ? (
            <Alert color="gray" variant="light" title="Empty folder">
              Import needs an ASA tree on disk. Use New server on this path, then Install.
            </Alert>
          ) : null}
          {suggested !== null &&
            props.onUseSuggestedDir !== undefined &&
            activeProbe.nestedSubfolder && (
              <Button
                size="xs"
                variant="light"
                disabled={props.probing || props.browsing}
                onClick={() => props.onUseSuggestedDir?.(suggested)}
              >
                Use suggested folder
              </Button>
            )}
        </Stack>
      )}
    </Stack>
  );
}
