import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import {
  buildStructuredLaunchToken,
  isStructuredDependencyMet,
  isStructuredOptionEffectivelyEnabled,
} from "@shared/structured-launch-options";
import { useUiDensity } from "@app/AppProviders";
import { LaunchOptionsCatalogModal } from "@features/servers/components/LaunchOptionsCatalogModal/LaunchOptionsCatalogModal";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ServerLaunchOptionRow } from "./ServerLaunchOptionRow";
import { ServerLaunchPreview } from "./ServerLaunchPreview";
import {
  buildLaunchPreviewParts,
  findLaunchArgConflicts,
  groupStructuredOptions,
  STRUCTURED_LAUNCH_GROUP_ORDER,
  structuredLaunchGroupLabel,
} from "./serverLaunchModel";
import { useServerLaunchPersist } from "./useServerLaunchPersist";
import classes from "./ServerLaunchPanel.module.css";

interface Props {
  server: ServerProfile;
  onServerUpdated: () => void;
}

export function ServerLaunchPanel(props: Props): ReactElement {
  const density = useUiDensity();
  const inputSize: "xs" | "sm" = density === "compact" ? "xs" : "sm";
  const [previewOpen, setPreviewOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const {
    structured,
    rawText,
    setRawText,
    extraArgs,
    saving,
    error,
    setEnabled,
    setValue,
    persistExtraArgsFromRaw,
  } = useServerLaunchPersist(props.server, props.onServerUpdated);

  const conflicts = useMemo(
    () => findLaunchArgConflicts({ structured, extraArgs }),
    [structured, extraArgs],
  );
  const grouped = useMemo(() => groupStructuredOptions(), []);
  const activeWarnings = useMemo(() => {
    return [...grouped.values()]
      .flat()
      .filter(
        (o) =>
          o.curation.operatorWarning &&
          isStructuredOptionEffectivelyEnabled(o.curation.id, structured),
      );
  }, [grouped, structured]);
  const cautionTokens = useMemo(() => {
    const set = new Set<string>();
    for (const o of activeWarnings) {
      const token = buildStructuredLaunchToken(
        o.entry,
        structured[o.curation.id]?.value,
      );
      if (token !== null) set.add(token);
    }
    return set;
  }, [activeWarnings, structured]);
  const preview = useMemo(
    () =>
      buildLaunchPreviewParts({
        server: props.server,
        structured,
        extraArgs,
      }),
    [props.server, structured, extraArgs],
  );

  return (
    <div className={classes.panel} data-testid="server-launch-panel">
      <div className={classes.scroll}>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text fw={600}>Launch options</Text>
              <Text size="xs" c="dimmed">
                Hover a flag for its description. Map, port, and cluster stay
                YARK-owned. Platform defaults to ALL unless set here.
              </Text>
            </div>
            <Button
              size={inputSize}
              variant="light"
              onClick={() => setCatalogOpen(true)}
            >
              Browse ASA catalog
            </Button>
          </Group>

          {error !== null ? <Alert color="red">{error}</Alert> : null}

          <div className={classes.groups}>
            {STRUCTURED_LAUNCH_GROUP_ORDER.map((groupId) => {
              const options = grouped.get(groupId) ?? [];
              if (options.length === 0) return null;
              const onCount = options.filter((o) =>
                isStructuredOptionEffectivelyEnabled(o.curation.id, structured),
              ).length;
              return (
                <section key={groupId} className={classes.groupSection}>
                  <div className={classes.groupHeader}>
                    <span className={classes.groupTitle}>
                      {structuredLaunchGroupLabel(groupId)}
                    </span>
                    <Text size="xs" c="dimmed">
                      {onCount}/{options.length}
                    </Text>
                  </div>
                  <div className={classes.optionGrid}>
                    {options.map((option) => {
                      const dependencyMet = isStructuredDependencyMet(
                        option.curation.id,
                        structured,
                      );
                      return (
                        <ServerLaunchOptionRow
                          key={option.curation.id}
                          option={option}
                          selection={structured[option.curation.id]}
                          inputSize={inputSize}
                          dependencyMet={dependencyMet}
                          onEnabledChange={(enabled) =>
                            void setEnabled(
                              option.curation.id,
                              enabled,
                              option.curation.defaultValue,
                            )
                          }
                          onValueChange={(value) =>
                            setValue(option.curation.id, value)
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <AppSurfaceCard tone="flat">
            <Stack gap="xs">
              <Textarea
                label="Extra arguments"
                description='Example: -CustomNotificationURL="http://example.com/notice.html"'
                value={rawText}
                onChange={(e) => setRawText(e.currentTarget.value)}
                onBlur={() => {
                  void persistExtraArgsFromRaw();
                }}
                minRows={3}
                autosize
                size={inputSize}
              />
              {conflicts.length > 0 ? (
                <Alert color="red" title="Conflicts">
                  <Stack gap={4}>
                    {conflicts.map((c) => (
                      <Text key={c.message} size="sm">
                        {c.message}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              ) : null}
              {saving ? (
                <Text size="xs" c="dimmed">
                  Saving…
                </Text>
              ) : null}
            </Stack>
          </AppSurfaceCard>

          <ServerLaunchPreview
            installDir={props.server.installDir}
            inputSize={inputSize}
            open={previewOpen}
            onToggle={() => setPreviewOpen((v) => !v)}
            yark={preview.yark}
            structured={preview.structured}
            raw={preview.raw}
            cautionTokens={cautionTokens}
          />
        </Stack>
      </div>

      <LaunchOptionsCatalogModal
        opened={catalogOpen}
        onClose={() => setCatalogOpen(false)}
      />
    </div>
  );
}
