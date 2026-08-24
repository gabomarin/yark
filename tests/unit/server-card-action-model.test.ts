import { describe, expect, it } from "vitest";
import type { ServerStatus } from "@shared/types";
import type { ServerUpdateState } from "@shared/server-update-status";
import {
  resolveRestartAction,
  resolveRuntimeAction,
  resolveUpdateAction,
} from "@features/servers/components/ServerCard/serverCardActionModel";

type Combo = {
  name: string;
  status: ServerStatus;
  steamCmdBusy: boolean;
  steamCmdOperation?: "install-files" | "update" | "sync-files" | "verify-files" | "install-steamcmd";
  installed: boolean;
  serverEnabled: boolean;
  updateState: ServerUpdateState;
  expectRuntime: { kind: string; disabled: boolean };
  expectUpdate: { kind: string; label: string; disabled: boolean };
};

const combos: Combo[] = [
  {
    name: "stopped + current",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: true,
    updateState: "current",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
  {
    name: "stopped + available",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: true,
    updateState: "available",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Update server", disabled: false },
  },
  {
    name: "stopped + unknown",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: true,
    updateState: "unknown",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Update (couldn't check version)", disabled: false },
  },
  {
    name: "not installed",
    status: "stopped",
    steamCmdBusy: false,
    installed: false,
    serverEnabled: true,
    updateState: "unknown",
    expectRuntime: { kind: "start", disabled: true },
    expectUpdate: { kind: "install", label: "Install server files", disabled: false },
  },
  {
    name: "disabled + installed",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: false,
    updateState: "current",
    expectRuntime: { kind: "enable", disabled: false },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
  {
    name: "disabled + not installed",
    status: "stopped",
    steamCmdBusy: false,
    installed: false,
    serverEnabled: false,
    updateState: "unknown",
    expectRuntime: { kind: "enable", disabled: false },
    expectUpdate: { kind: "install", label: "Install server files", disabled: false },
  },
  {
    name: "starting keeps Stop",
    status: "starting",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: true,
    updateState: "current",
    expectRuntime: { kind: "stop", disabled: false },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
  {
    name: "running + available disables Update",
    status: "running",
    steamCmdBusy: false,
    installed: true,
    serverEnabled: true,
    updateState: "available",
    expectRuntime: { kind: "stop", disabled: false },
    expectUpdate: { kind: "update", label: "Update server", disabled: true },
  },
  {
    name: "steamCmd busy + stopping keeps Stop disabled",
    status: "stopping",
    steamCmdBusy: true,
    installed: true,
    serverEnabled: true,
    updateState: "available",
    expectRuntime: { kind: "stopping", disabled: true },
    expectUpdate: { kind: "update", label: "Update server", disabled: true },
  },
  {
    name: "steamCmd busy update keeps Start locked",
    status: "stopped",
    steamCmdBusy: true,
    steamCmdOperation: "update",
    installed: true,
    serverEnabled: true,
    updateState: "available",
    expectRuntime: { kind: "start", disabled: true },
    expectUpdate: { kind: "update", label: "Update server", disabled: true },
  },
  {
    name: "steamCmd busy verify keeps Start locked",
    status: "stopped",
    steamCmdBusy: true,
    steamCmdOperation: "verify-files",
    installed: true,
    serverEnabled: true,
    updateState: "current",
    expectRuntime: { kind: "start", disabled: true },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
];

describe("serverCardActionModel combos", () => {
  it.each(combos)("$name", (combo) => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: combo.steamCmdBusy,
      steamCmdOperation: combo.steamCmdOperation,
      isInstallationReady: combo.installed,
      status: combo.status,
      serverEnabled: combo.serverEnabled,
    });
    const update = resolveUpdateAction({
      steamCmdBusy: combo.steamCmdBusy,
      isInstallationReady: combo.installed,
      status: combo.status,
      serverEnabled: combo.serverEnabled,
      updateState: combo.updateState,
    });
    const restart = resolveRestartAction({
      steamCmdBusy: combo.steamCmdBusy,
      isInstallationReady: combo.installed,
      status: combo.status,
      serverEnabled: combo.serverEnabled,
    });

    expect(runtime.kind).toBe(combo.expectRuntime.kind);
    expect(runtime.disabled).toBe(combo.expectRuntime.disabled);
    expect(update.kind).toBe(combo.expectUpdate.kind);
    expect(update.label).toBe(combo.expectUpdate.label);
    expect(update.disabled).toBe(combo.expectUpdate.disabled);

    if (combo.status === "starting" || combo.status === "stopping") {
      expect(restart.disabled).toBe(true);
    }
    if (combo.expectRuntime.kind === "stop" || combo.expectRuntime.kind === "stopping") {
      expect(runtime.color).toBe("red");
    }
    if (combo.status === "running" && !combo.steamCmdBusy) {
      expect(restart.color).toBe("fossil");
    }
  });

  it("treats omitted serverEnabled as enabled", () => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: false,
      isInstallationReady: true,
      status: "stopped",
    });
    const restart = resolveRestartAction({
      steamCmdBusy: false,
      isInstallationReady: true,
      status: "running",
    });

    expect(runtime.kind).toBe("start");
    expect(restart.visible).toBe(true);
  });

  it("locks Start when a Downloads job is queued", () => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: false,
      steamCmdQueued: true,
      isInstallationReady: true,
      status: "stopped",
    });
    expect(runtime.kind).toBe("start");
    expect(runtime.disabled).toBe(true);
  });

  it("shows Starting… while startBusy before runtime status updates (#390)", () => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: false,
      isInstallationReady: true,
      status: "stopped",
      startBusy: true,
    });
    expect(runtime).toMatchObject({
      kind: "starting",
      label: "Starting…",
      disabled: true,
      visible: true,
    });
  });

  it("keeps Stop once runtime status is starting even with startBusy (#390)", () => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: false,
      isInstallationReady: true,
      status: "starting",
      startBusy: true,
    });
    expect(runtime.kind).toBe("stop");
    expect(runtime.disabled).toBe(false);
  });

  it("allows Enable without installation files and locks it only while SteamCMD is busy (#132)", () => {
    const ready = resolveRuntimeAction({
      steamCmdBusy: false,
      isInstallationReady: false,
      status: "stopped",
      serverEnabled: false,
    });
    expect(ready).toMatchObject({
      kind: "enable",
      disabled: false,
      visible: true,
    });

    const busy = resolveRuntimeAction({
      steamCmdBusy: true,
      steamCmdOperation: "update",
      isInstallationReady: false,
      status: "stopped",
      serverEnabled: false,
    });
    expect(busy).toMatchObject({
      kind: "enable",
      disabled: true,
      hint: "Another server operation is in progress",
      visible: true,
    });
  });

  it("shows Restarting… while startBusy on a running server (#390)", () => {
    const restart = resolveRestartAction({
      steamCmdBusy: false,
      isInstallationReady: true,
      status: "running",
      startBusy: true,
    });
    expect(restart).toMatchObject({
      label: "Restarting…",
      disabled: true,
      visible: true,
    });
  });

  it("keeps Restart static and disabled while Start is in flight (#390)", () => {
    for (const status of ["stopped", "starting", "stopping"] as const) {
      const restart = resolveRestartAction({
        steamCmdBusy: false,
        isInstallationReady: true,
        status,
        startBusy: true,
      });
      expect(restart.label).toBe("Restart server");
      expect(restart.disabled).toBe(true);
    }
  });
});
