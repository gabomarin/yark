import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import type { WorkspaceTab } from "@features/server-workspace/ServerWorkspacePage";
import type { ServerProfile } from "@shared/types";

export type Overlay =
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | { kind: "clone"; sourceServerId: string }
  | {
      kind: "workspace";
      serverId: string;
      onboarding?: boolean;
      initialTab?: WorkspaceTab;
      logsFocus?: ServerLogsFocus | null;
    }
  | null;

export type CopyConfigSession = {
  sourceServerId: string;
  targetServerId?: string;
};
