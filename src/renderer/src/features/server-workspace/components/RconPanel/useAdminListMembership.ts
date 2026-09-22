import type { AdminListEditAction, AdminListStateDto } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT,
  notifyHostedResourcesDiagnosticsUpdated,
} from "@features/hosted-resources/hooks/useHostedResourcesHealth";
import { useHostedResourceOptions } from "@features/hosted-resources/hooks/useHostedResourceOptions";
import { classifyHostedResourceValue } from "@features/hosted-resources/model/hostedResourceAssignment";
import { ADMIN_LIST_URL_CONSUMER } from "@shared/settings/hosted-resource-consumers";
import type { HostedResourceLike } from "@shared/settings/hosted-resource-consumers";

/**
 * Local add/remove of ids on a hosted AdminList resource (#565). True only when the active
 * AdminListURL is a loopback URL served by a current, compatible, published YARK resource.
 * Third-party remote lists and broken resources stay read-only.
 */
export function isAdminListEditable(
  loaded: boolean,
  state: AdminListStateDto | null,
  resources: readonly HostedResourceLike[],
): boolean {
  if (!loaded || state === null || state.mode !== "loopback") return false;
  const assignment = classifyHostedResourceValue(state.adminListUrl, resources, ADMIN_LIST_URL_CONSUMER);
  return assignment.resource !== null && assignment.issue === null;
}

interface AdminListMembership {
  state: AdminListStateDto | null;
  editable: boolean;
  busyKey: string | null;
  isMember: (id: string) => boolean;
  editMember: (id: string, action: AdminListEditAction, name?: string) => Promise<void>;
}

/** Survivors star toggling for the AdminList hosted resource behind the loopback URL (#565). */
export function useAdminListMembership(serverId: string): AdminListMembership {
  const [state, setState] = useState<AdminListStateDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { resources, loaded } = useHostedResourceOptions();

  const load = useCallback(async (): Promise<void> => {
    const result = await window.api.getAdminList(serverId);
    if (result.ok) {
      setState(result.data);
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, load);
    return () => {
      window.removeEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, load);
    };
  }, [load]);

  const editable = isAdminListEditable(loaded, state, resources);

  const isMember = useCallback(
    (id: string): boolean =>
      editable ? (state?.entries.some((entry) => entry.id.toLowerCase() === id.toLowerCase()) ?? false) : false,
    [editable, state],
  );

  const editMember = useCallback(
    async (id: string, action: AdminListEditAction, name?: string): Promise<void> => {
      setBusyKey(id);
      await runWithFinally(
        async () => {
          const result = await window.api.editAdminListMember(serverId, id, action, name);
          if (result.ok) {
            setState(result.data);
            notifyHostedResourcesDiagnosticsUpdated();
            const interval = result.data.updateAllowedCheatersInterval;
            showOperatorToast({
              title: "Admin list",
              message: `Saved. ASA re-checks this list every ${interval}s — no restart needed.`,
              color: "ok",
              autoClose: 6000,
            });
          } else {
            showOperatorError(result.error ?? `Could not ${action} admin id`);
          }
        },
        () => {
          setBusyKey(null);
        },
      );
    },
    [serverId],
  );

  return { state, editable, busyKey, isMember, editMember };
}
