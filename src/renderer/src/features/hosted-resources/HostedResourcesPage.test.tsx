import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceDto, HostedResourcesOverviewDto } from "@shared/ipc";
import { HostedResourcesPage } from "./HostedResourcesPage";

const resource: HostedResourceDto = {
  id: "hr-1",
  displayName: "Admins allowlist",
  format: "text",
  url: "http://127.0.0.1:8935/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  revoked: false,
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  revisionCount: 2,
  publishedRevisionId: "rev-2",
  publishedSequence: 2,
  publishedSha256: "b".repeat(64),
  publishedSizeBytes: 4096,
};

function overview(enabled: boolean, resources: HostedResourceDto[] = []): HostedResourcesOverviewDto {
  return {
    state: {
      enabled,
      port: 8935,
      bindHost: "127.0.0.1",
      listening: enabled,
      error: null,
    },
    resources,
  };
}

describe("HostedResourcesPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the experimental hint and enables the host", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(false) }),
      setHostedResourcesEnabled: vi.fn().mockResolvedValue({
        ok: true,
        data: overview(true).state,
      }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    expect(await screen.findByText("Host is off")).toBeInTheDocument();
    expect(screen.getByText("Experimental")).toBeInTheDocument();
    expect(screen.getByText(/binds to 127.0.0.1 only/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Enabled"));
    await waitFor(() => {
      expect(api.setHostedResourcesEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("lists published resources with their loopback URL", async () => {
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi
        .fn()
        .mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    expect(await screen.findByText("Admins allowlist")).toBeInTheDocument();
    expect(screen.getByText(resource.url)).toBeInTheDocument();
    expect(screen.getByText(/2 revisions/)).toBeInTheDocument();
    expect(screen.getByText("Current size: 4.0 KB")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Publish new revision" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/0 B \/ 512 KB/)).toBeInTheDocument();
  });
});
