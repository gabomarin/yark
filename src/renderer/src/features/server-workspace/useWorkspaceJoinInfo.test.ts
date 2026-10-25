import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { IpcResult } from "@shared/ipc";
import { useWorkspaceJoinInfo } from "./useWorkspaceJoinInfo";

describe("useWorkspaceJoinInfo", () => {
  beforeEach(() => {
    window.api = createRendererApiMock();
  });

  it("refreshes the public IP at the start of every server run", async () => {
    const { rerender } = renderHook(({ running }) => useWorkspaceJoinInfo(running), {
      initialProps: { running: true },
    });

    await waitFor(() => {
      expect(window.api.getPublicIp).toHaveBeenCalledOnce();
    });

    rerender({ running: false });
    rerender({ running: true });

    await waitFor(() => {
      expect(window.api.getPublicIp).toHaveBeenCalledTimes(2);
    });
  });

  it("applies a public IP lookup that returns after the server stops", async () => {
    let resolveIp: (value: IpcResult<string>) => void = () => {};
    window.api.getPublicIp = vi.fn(
      () =>
        new Promise<IpcResult<string>>((resolve) => {
          resolveIp = resolve;
        }),
    );
    const { rerender, result } = renderHook(({ running }) => useWorkspaceJoinInfo(running), {
      initialProps: { running: false },
    });

    rerender({ running: true });
    await waitFor(() => {
      expect(window.api.getPublicIp).toHaveBeenCalledOnce();
    });
    rerender({ running: false });
    resolveIp({ ok: true, data: "203.0.113.6" });

    await waitFor(() => {
      expect(result.current.publicIp).toBe("203.0.113.6");
    });
  });
});
