import { describe, expect, it } from "vitest";
import type { ServerStatus } from "@shared/types";
import type { ServerUpdateState } from "@shared/server-update-status";
import {
  resolveRestartAction,
  resolveRuntimeAction,
  resolveUpdateAction,
} from "../../src/renderer/src/features/servers/components/ServerCard/serverCardActionModel";

type Combo = {
  name: string;
  status: ServerStatus;
  steamCmdBusy: boolean;
  installed: boolean;
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
    updateState: "current",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
  {
    name: "stopped + available",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    updateState: "available",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Update server", disabled: false },
  },
  {
    name: "stopped + unknown",
    status: "stopped",
    steamCmdBusy: false,
    installed: true,
    updateState: "unknown",
    expectRuntime: { kind: "start", disabled: false },
    expectUpdate: { kind: "update", label: "Update status unknown", disabled: false },
  },
  {
    name: "not installed",
    status: "stopped",
    steamCmdBusy: false,
    installed: false,
    updateState: "unknown",
    expectRuntime: { kind: "start", disabled: true },
    expectUpdate: { kind: "install", label: "Install server files", disabled: false },
  },
  {
    name: "starting keeps Stop",
    status: "starting",
    steamCmdBusy: false,
    installed: true,
    updateState: "current",
    expectRuntime: { kind: "stop", disabled: false },
    expectUpdate: { kind: "update", label: "Server is up to date", disabled: true },
  },
  {
    name: "steamCmd busy + stopping keeps Cancel",
    status: "stopping",
    steamCmdBusy: true,
    installed: true,
    updateState: "available",
    expectRuntime: { kind: "cancel", disabled: false },
    expectUpdate: { kind: "update", label: "Update server", disabled: true },
  },
];

describe("serverCardActionModel combos", () => {
  it.each(combos)("$name", (combo) => {
    const runtime = resolveRuntimeAction({
      steamCmdBusy: combo.steamCmdBusy,
      isInstallationReady: combo.installed,
      status: combo.status,
    });
    const update = resolveUpdateAction({
      steamCmdBusy: combo.steamCmdBusy,
      isInstallationReady: combo.installed,
      status: combo.status,
      updateState: combo.updateState,
    });
    const restart = resolveRestartAction({
      steamCmdBusy: combo.steamCmdBusy,
      isInstallationReady: combo.installed,
      status: combo.status,
    });

    expect(runtime.kind).toBe(combo.expectRuntime.kind);
    expect(runtime.disabled).toBe(combo.expectRuntime.disabled);
    expect(update.kind).toBe(combo.expectUpdate.kind);
    expect(update.label).toBe(combo.expectUpdate.label);
    expect(update.disabled).toBe(combo.expectUpdate.disabled);

    if (combo.status === "starting" || combo.status === "stopping") {
      expect(restart.disabled).toBe(true);
    }
  });
});
