import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { ServerProfile } from "@shared/types";
import type { Overlay } from "@app/model/appOverlay";
import { AppShellWithChrome, type AppShellChromeProps } from "@app/appShellChrome";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import type { Route } from "@layout/Sidebar/Sidebar";

type FormOverlay = Extract<Overlay, { kind: "create" } | { kind: "edit" }>;

export interface AppFormOverlaysProps {
  shell: AppShellChromeProps;
  overlay: FormOverlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  navigate: (next: Route) => void;
  servers: ServerProfile[];
  defaultBaseFolder: string | null;
  extraClusterOptions: KnownClusterOption[] | undefined;
  registerOverlayLeaveGuard: (guard: ((action: () => void) => void) | null) => void;
  runWithOverlayLeaveGuard: (action: () => void) => void;
  consumePendingSetupCluster: () => void;
  refresh: (options?: {
    includeInstallation?: boolean;
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: import("@shared/types").InstallationServersMode;
  }) => Promise<unknown>;
}

export function AppFormOverlays(props: AppFormOverlaysProps): ReactElement {
  const {
    shell,
    overlay,
    setOverlay,
    navigate,
    servers,
    defaultBaseFolder,
    extraClusterOptions,
    registerOverlayLeaveGuard,
    runWithOverlayLeaveGuard,
    consumePendingSetupCluster,
    refresh,
  } = props;

  if (overlay.kind === "create") {
    return (
      <AppShellWithChrome shell={shell}>
        <ServerForm
          initial={null}
          defaultBaseFolder={defaultBaseFolder}
          servers={servers}
          extraClusterOptions={extraClusterOptions}
          onRegisterLeaveGuard={registerOverlayLeaveGuard}
          onOpenClusters={() => navigate("clusters")}
          onCancel={() => runWithOverlayLeaveGuard(() => setOverlay(null))}
          onSaved={(created) => {
            consumePendingSetupCluster();
            if (created !== undefined) {
              setOverlay({ kind: "workspace", serverId: created.id, onboarding: true });
              void refresh();
              return;
            }
            setOverlay(null);
            void refresh();
          }}
        />
      </AppShellWithChrome>
    );
  }

  return (
    <AppShellWithChrome shell={shell}>
      <ServerForm
        initial={overlay.profile}
        defaultBaseFolder={defaultBaseFolder}
        servers={servers}
        onRegisterLeaveGuard={registerOverlayLeaveGuard}
        onOpenClusters={() => navigate("clusters")}
        onCancel={() => runWithOverlayLeaveGuard(() => setOverlay(null))}
        onSaved={() => {
          setOverlay(null);
          void refresh();
        }}
      />
    </AppShellWithChrome>
  );
}
