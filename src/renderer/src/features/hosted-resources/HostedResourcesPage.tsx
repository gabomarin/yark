import type { ReactElement } from "react";
import { Broadcast, WarningCircle } from "@phosphor-icons/react";
import { Button, Group, NumberInput, Stack, Switch, Text } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { AppPageHeader } from "@ui/AppPageHeader/AppPageHeader";
import { LoadingState } from "@ui/LoadingState/LoadingState";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { summarizeReferences } from "./model/hostedResourcesPageModel";
import { useHostedResourcesPage } from "./hooks/useHostedResourcesPage";
import { HostedResourceCard } from "./components/HostedResourceCard/HostedResourceCard";
import { HostedResourceEditorModal } from "./components/HostedResourceEditorModal/HostedResourceEditorModal";
import { HostedResourceRevisionsModal } from "./components/HostedResourceRevisionsModal/HostedResourceRevisionsModal";
import { HostedResourcesDiagnosticsPanel } from "./components/HostedResourcesDiagnosticsPanel/HostedResourcesDiagnosticsPanel";
import classes from "./HostedResourcesPage.module.css";

const EXPERIMENTAL_HINT_STORAGE_KEY = "yark.hostedResources.experimentalHint.dismissed.v1";

export function HostedResourcesPage(): ReactElement {
  const controller = useHostedResourcesPage();
  const overview = controller.overview;
  const state = overview?.state ?? null;

  const referenceCountFor = (resourceId: string): number =>
    summarizeReferences(
      (controller.diagnostics?.references ?? []).filter((reference) => reference.resourceId === resourceId),
    );

  const observedRequestsFor = (resourceId: string): number | null => {
    const found = controller.diagnostics?.resources.find((entry) => entry.resourceId === resourceId);
    return found === undefined ? null : found.requestCount;
  };

  return (
    <PageScaffold title="Hosted Resources" fillViewport edgeToEdge showHeader={false}>
      <div className={classes.pageShell} data-hosted-resources-page>
        <AppPageHeader
          title="Hosted Resources"
          subtitle="Publish text, JSON, or INI content over a URL that ASA can load from this PC."
          actions={
            <Button variant="default" onClick={() => void controller.reload()} loading={controller.loading}>
              Refresh
            </Button>
          }
        />

        <Stack gap="md" className={classes.content}>
          {/* Task guidance goes first: it is why the operator opened this page, and below the
           * status card it was easy to never reach. */}
          {overview !== null && overview.resources.length > 0 && (
            <AppAlert color="blue" variant="light" title="Next step">
              Copy a resource URL and paste it into the server setting that uses it, such as <code>AdminListURL</code>{" "}
              in RCON → Admins. Keep YARK running while ASA needs to refresh the URL.
            </AppAlert>
          )}
          <DismissibleHint storageKey={EXPERIMENTAL_HINT_STORAGE_KEY} title="Experimental">
            This host binds to 127.0.0.1 only. URLs stop working when YARK exits, and a stale URL must not be trusted
            after a port change or if another process owns the port.
          </DismissibleHint>

          {state !== null && (
            <AppSurfaceCard radius={0} data-hosted-resources-status>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>
                      {state.enabled ? "Hosted Resources is enabled" : "Hosted Resources is disabled"}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {state.enabled
                        ? state.listening
                          ? `Listening on http://${state.bindHost}:${state.port}`
                          : "Enabled but not listening."
                        : "Turn on to serve published resources over loopback."}
                    </Text>
                  </div>
                  <Switch
                    label="Enabled"
                    checked={state.enabled}
                    disabled={controller.busy === "toggle"}
                    onChange={(event) => void controller.toggleEnabled(event.currentTarget.checked)}
                    data-hosted-resources-enabled
                  />
                </Group>

                <Group align="flex-end">
                  <NumberInput
                    label="Port"
                    value={controller.portDraft}
                    onChange={controller.setPortDraft}
                    min={1024}
                    max={65535}
                    clampBehavior="strict"
                    w={140}
                    disabled={!state.enabled}
                    data-hosted-resources-port
                  />
                  <Button
                    variant="default"
                    onClick={() => void controller.applyPort()}
                    loading={controller.busy === "port"}
                    disabled={!state.enabled}
                  >
                    Apply port
                  </Button>
                </Group>

                {state.error !== null && (
                  <AppAlert color="red" variant="light" title="Port unavailable">
                    {state.error}
                  </AppAlert>
                )}
              </Stack>
            </AppSurfaceCard>
          )}

          {overview === null ? (
            controller.loadError !== null ? (
              <AppSurfaceCard radius={0}>
                <EmptyState
                  icon={<WarningCircle size={22} />}
                  title="Could not load Hosted Resources"
                  description={controller.loadError}
                  action={<Button onClick={() => void controller.reload()}>Retry</Button>}
                />
              </AppSurfaceCard>
            ) : (
              <AppSurfaceCard radius={0}>
                <LoadingState label="hosted resources" />
              </AppSurfaceCard>
            )
          ) : overview.resources.length === 0 ? (
            <AppSurfaceCard radius={0}>
              <EmptyState
                icon={<Broadcast size={22} />}
                title="No resources yet"
                description={
                  overview.state.enabled
                    ? "Publish a list to get a stable http://127.0.0.1 URL you can paste into a server setting."
                    : "Turn the host on above (or publish now — the URL starts serving once it is on)."
                }
                action={<Button onClick={controller.openCreate}>New resource</Button>}
              />
            </AppSurfaceCard>
          ) : (
            <>
              <Group justify="flex-end">
                <Button onClick={controller.openCreate}>New resource</Button>
              </Group>
              {overview.resources.map((resource) => (
                <HostedResourceCard
                  key={resource.id}
                  resource={resource}
                  referencedServerCount={referenceCountFor(resource.id)}
                  observedRequests={observedRequestsFor(resource.id)}
                  busy={controller.busy !== null}
                  onEdit={() => void controller.openEdit(resource)}
                  onRevisions={() => void controller.openRevisions(resource)}
                  onToggleEnabled={(enabled) => controller.toggleResourceEnabled(resource, enabled)}
                  onDelete={() => controller.confirmDelete(resource)}
                />
              ))}
            </>
          )}

          <HostedResourcesDiagnosticsPanel
            diagnostics={controller.diagnostics}
            busy={controller.diagnosticsBusy}
            onRun={() => void controller.runDiagnostics()}
          />
        </Stack>

        <HostedResourceEditorModal
          draft={controller.editor}
          busy={controller.busy === "editor"}
          onChange={controller.updateEditor}
          onClose={controller.closeEditor}
          onSubmit={() => void controller.submitEditor()}
        />

        <HostedResourceRevisionsModal
          opened={controller.revisionsFor !== null}
          revisions={controller.revisions}
          busy={controller.busy !== null}
          onClose={controller.closeRevisions}
          onPublish={(revisionId) => void controller.publishRevision(revisionId)}
        />
      </div>
    </PageScaffold>
  );
}
