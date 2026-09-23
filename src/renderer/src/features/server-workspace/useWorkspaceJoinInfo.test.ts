import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
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
});
