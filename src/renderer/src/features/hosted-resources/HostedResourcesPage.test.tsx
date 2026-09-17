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
  enabled: true,
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  revisionCount: 2,
  publishedRevisionId: "rev-2",
  publishedSequence: 2,
  publishedSha256: "b".repeat(64),
  publishedSizeBytes: 4096,
  notes: "Used by the admin allowlist.",
  tags: ["admins", "asa"],
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

    expect(await screen.findByText("Hosted Resources is disabled")).toBeInTheDocument();
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
      getHostedResourceContent: vi
        .fn()
        .mockResolvedValue({ ok: true, data: "EOSID1\nEOSID2\n" }),
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
    expect(screen.getByText("Used by the admin allowlist.")).toBeInTheDocument();
    expect(screen.getByText("admins")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/14 B \/ 512 KB/)).toBeInTheDocument();
    expect(screen.getByLabelText("Content")).toHaveValue("EOSID1\nEOSID2\n");
  });

  it("disables a resource after confirmation", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi
        .fn()
        .mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
      setHostedResourceEnabled: vi.fn().mockResolvedValue({ ok: true, data: resource }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "More resource actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disable resource" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      expect(api.setHostedResourceEnabled).toHaveBeenCalledWith(resource.id, false);
    });
  });
});
