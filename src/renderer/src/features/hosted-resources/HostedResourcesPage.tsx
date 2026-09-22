import type { ReactElement } from "react";
import { ArrowClockwise, Broadcast, WarningCircle } from "@phosphor-icons/react";
import { Badge, Button, Group, NumberInput, Stack, Switch, Text } from "@mantine/core";
import type { HostedResourceReferenceDto } from "@shared/ipc";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { AppPageHeader } from "@ui/AppPageHeader/AppPageHeader";
import { LoadingState } from "@ui/LoadingState/LoadingState";
import { DismissibleHint } from "@ui/DismissibleHint/DismissibleHint";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { hasDiagnosticWarning } from "./model/hostedResourcesHealth";
import { listeningBadge, resolveHeaderAlert, summarizeReferences } from "./model/hostedResourcesPageModel";
import { useHostedResourcesPage } from "./hooks/useHostedResourcesPage";
import { HostedResourceCard } from "./components/HostedResourceCard/HostedResourceCard";
import { HostedResourceEditorModal } from "./components/HostedResourceEditorModal/HostedResourceEditorModal";
import { HostedResourceRevisionsModal } from "./components/HostedResourceRevisionsModal/HostedResourceRevisionsModal";
import classes from "./HostedResourcesPage.module.css";

const EXPERIMENTAL_HINT_STORAGE_KEY = "yark.hostedResources.experimentalHint.dismissed.v1";

/** Mirrors how `applyPort` parses the draft: Mantine can hand back "" or "8,080" mid-edit. */
function parsePortDraft(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value.replaceAll(",", ""), 10);
}

interface Props {
  onOpenReference?: (reference: HostedResourceReferenceDto) => void;
}

export function HostedResourcesPage({ onOpenReference = () => undefined }: Props = {}): ReactElement {
  const controller = useHostedResourcesPage();
  const overview = controller.overview;
  const state = overview?.state ?? null;
  const hostedResourcesDisabledWithReferences =
    controller.diagnostics?.state.enabled === false && controller.diagnostics.references.length > 0;
  const draftPort = state === null ? Number.NaN : parsePortDraft(controller.portDraft);
  const portChanged = state !== null && Number.isInteger(draftPort) && draftPort !== state.port;
  const listening = state === null ? null : listeningBadge(state);
  const diagnosticsWarning =
    controller.diagnostics !== null &&
    controller.diagnostics.state.enabled &&
    hasDiagnosticWarning(controller.diagnostics);
  const headerAlert = resolveHeaderAlert({
    stateError: state?.error,
    disabledWithReferences: hostedResourcesDisabledWithReferences,
    ownershipFailed: controller.diagnostics?.state.enabled === true && !controller.diagnostics.ownership.ok,
    portChanged,
    diagnosticsWarning,
  });

  const referenceCountFor = (resourceId: string): number =>
    summarizeReferences(
      (controller.diagnostics?.references ?? []).filter((reference) => reference.resourceId === resourceId),
    );

  const observedRequestsFor = (resourceId: string): number | null => {
    const found = controller.diagnostics?.resources.find((entry) => entry.resourceId === resourceId);
    return found === undefined ? null : found.requestCount;
  };

  const diagnosticStatusFor = (resourceId: string) => {
    if (controller.diagnostics?.state.enabled === false) return null;
    const found = controller.diagnostics?.resources.find((entry) => entry.resourceId === resourceId);
    return found?.status ?? null;
  };

  const referenceIssuesFor = (resourceId: string) =>
    (controller.diagnostics?.references ?? []).filter(
      (reference) => reference.resourceId === resourceId && reference.status !== "current",
    );

  return (
    <PageScaffold title="Hosted Resources" fillViewport edgeToEdge showHeader={false}>
      <div className={classes.pageShell} data-hosted-resources-page>
        <AppPageHeader
          title="Hosted Resources"
          subtitle="Serve text, INI or JSON from this PC at a URL, so an ASA setting that takes a URL - an admin whitelist, a dynamic config - can point here instead of at a public pastebin."
          actions={
            <Button variant="default" onClick={() => void controller.reload()} loading={controller.loading}>
              Refresh
            </Button>
          }
        />

        <Stack gap="md" className={classes.content}>
          {/* Task guidance goes first: it is why the operator opened this page, and below the
           * status card it was easy to never reach. */}
          {overview !== null && (overview.resources.length > 0 || headerAlert !== null) && (
            <AppAlert color={headerAlert?.color ?? "blue"} variant="light" title={headerAlert?.title ?? "Next step"}>
              {headerAlert?.message ?? (
                <>
                  Copy a resource URL and paste it into the server setting that uses it, such as{" "}
                  <code>AdminListURL</code> in RCON → Admins. Keep YARK running while ASA needs to refresh the URL.
                </>
              )}
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
                    <Group gap="xs">
                      <Text fw={600}>
                        {state.enabled ? "Hosted Resources is enabled" : "Hosted Resources is disabled"}
                      </Text>
                      {listening !== null && (
                        <Badge variant="light" color={listening.color}>
                          {listening.label}
                        </Badge>
                      )}
                    </Group>
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

                <Stack gap="xs">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Group align="flex-end">
                      <NumberInput
                        label="Serving port"
                        description="Changing this port changes every resource URL."
                        value={controller.portDraft}
                        onChange={controller.setPortDraft}
                        min={1024}
                        max={65535}
                        clampBehavior="strict"
                        w={180}
                        disabled={!state.enabled}
                        data-hosted-resources-port
                      />
                      <Button
                        variant="default"
                        onClick={() => void controller.applyPort()}
                        loading={controller.busy === "port"}
                        disabled={!state.enabled}
                      >
                        {portChanged ? "Change serving port" : "Apply port"}
                      </Button>
                    </Group>
                    <Button
                      size="sm"
                      variant="default"
                      leftSection={<ArrowClockwise size={14} />}
                      onClick={() => void controller.runDiagnostics()}
                      loading={controller.diagnosticsBusy}
                    >
                      Check health
                    </Button>
                  </Group>
                </Stack>
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
                  diagnosticStatus={diagnosticStatusFor(resource.id)}
                  referenceIssues={referenceIssuesFor(resource.id)}
                  onOpenReference={onOpenReference}
                  busy={controller.busy !== null}
                  onEdit={() => void controller.openEdit(resource)}
                  onRevisions={() => void controller.openRevisions(resource)}
                  onToggleEnabled={(enabled) => controller.toggleResourceEnabled(resource, enabled)}
                  onDelete={() => controller.confirmDelete(resource)}
                />
              ))}
            </>
          )}
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
