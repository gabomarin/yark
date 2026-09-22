import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceDto, HostedResourcesDiagnosticsDto, HostedResourcesOverviewDto } from "@shared/ipc";
import { HostedResourcesPage } from "./HostedResourcesPage";

const resource: HostedResourceDto = {
  id: "hr-1",
  displayName: "Admins allowlist",
  format: "text",
  kind: "admin-list",
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

function diagnostics(servedOk = true): HostedResourcesDiagnosticsDto {
  return {
    state: overview(true).state,
    checkedAt: "2026-09-21T22:00:00.000Z",
    ownership: { ok: true, message: "Only YARK's listener answered." },
    resources: [
      {
        resourceId: resource.id,
        displayName: resource.displayName,
        url: resource.url,
        enabled: true,
        published: true,
        declaredSha256: resource.publishedSha256,
        servedSha256: servedOk ? resource.publishedSha256 : null,
        status: servedOk ? "verified" : "unreachable",
        servedOk,
        requestCount: 3,
      },
    ],
    references: [],
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
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
      getHostedResourceContent: vi.fn().mockResolvedValue({ ok: true, data: "EOSID1\nEOSID2\n" }),
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
    expect(screen.getByLabelText("Resource content")).toHaveValue("EOSID1\nEOSID2\n");
  });

  it("explains that changing the serving port invalidates existing URLs", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true) }),
      setHostedResourcesPort: vi.fn().mockResolvedValue({ ok: true, data: overview(true).state }),
      getHostedResourcesDiagnostics: vi.fn().mockResolvedValue({ ok: true, data: diagnostics() }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    const port = await screen.findByLabelText("Serving port");
    expect(screen.getByText("Changing this port changes every resource URL.")).toBeInTheDocument();
    fireEvent.change(port, { target: { value: "9000" } });

    expect(screen.getByText("Existing URLs will become stale")).toBeInTheDocument();
    expect(screen.getByText(/Update the affected resource cards/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change serving port" }));
    await waitFor(() => {
      expect(api.setHostedResourcesPort).toHaveBeenCalledWith(9000);
      expect(api.getHostedResourcesDiagnostics).toHaveBeenCalledTimes(1);
    });
  });

  it("disables a resource after confirmation", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
      setHostedResourceEnabled: vi.fn().mockResolvedValue({ ok: true, data: resource }),
      getHostedResourcesDiagnostics: vi.fn().mockResolvedValue({ ok: true, data: diagnostics() }),
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
      expect(api.getHostedResourcesDiagnostics).toHaveBeenCalledTimes(1);
    });
  });

  it("offers every resource type while creating, and the type drives the format (#577)", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true) }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "New resource" }));
    const dialog = await screen.findByRole("dialog");
    // Mantine's Select labels both the input and its listbox, so pin the query to the input.
    const type = within(dialog).getByLabelText("Type", { selector: "input" });
    expect(within(dialog).getByLabelText("Format", { selector: "input" })).toHaveValue("Plain text");

    await user.click(type);
    expect(await screen.findByRole("option", { name: "Dynamic config" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Admin list" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ban list" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Dynamic config" }));
    const format = within(dialog).getByLabelText("Format", { selector: "input" });
    expect(format).toHaveValue("INI");
    expect(format).toBeDisabled();
  });

  it("only offers the types an existing resource's format allows when editing (#577)", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
      getHostedResourceContent: vi.fn().mockResolvedValue({ ok: true, data: "EOSID1\n" }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The format cannot be changed")).toBeInTheDocument();
    expect(within(dialog).getByText(/controls validation and the content type ASA receives/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/You can clear the type and keep serving the URL/i)).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Type", { selector: "input" }));
    expect(await screen.findByRole("option", { name: "Ban list" })).toBeInTheDocument();
    // Listed but inert: the body format cannot change, so a dynamic config can never apply here.
    const dynamicOption = screen.getByRole("option", { name: "Dynamic config" });
    expect(dynamicOption).toHaveAttribute("data-combobox-disabled", "true");
    await user.click(dynamicOption);
    expect(within(dialog).getByLabelText("Type", { selector: "input" })).toHaveValue("Admin list");
  });

  it("shows host and resource state as badges, claiming health only after diagnostics", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true, [resource]) }),
      getHostedResourcesDiagnostics: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ...diagnostics(),
          references: [
            {
              resourceId: resource.id,
              serverId: "server-1",
              serverName: "The Island",
              key: "AdminListURL",
              url: "http://127.0.0.1:8934/r/old-token",
              status: "stale-port",
            },
          ],
        },
      }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    expect(await screen.findByText("Listening")).toBeInTheDocument();
    // Published, but no probe yet: gray, not a green claim.
    expect(screen.getByText("Published · not checked")).toBeInTheDocument();

    await screen.findByText("Listening");
    await user.click(screen.getByRole("button", { name: "Check health" }));
    expect(screen.getAllByText(resource.url)).toHaveLength(1);
    expect(screen.getByText("Previous port")).toBeInTheDocument();
    expect(screen.queryByText("Published · not checked")).not.toBeInTheDocument();
  });

  it("runs diagnostics automatically after publishing while the host is enabled", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview(true) }),
      createHostedResource: vi.fn().mockResolvedValue({ ok: true, data: resource }),
      getHostedResourcesDiagnostics: vi.fn().mockResolvedValue({ ok: true, data: diagnostics() }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "New resource" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Display name" }), resource.displayName);
    await user.type(within(dialog).getByLabelText("Resource content"), "EOSID1");
    await user.click(within(dialog).getByRole("button", { name: "Create resource" }));

    await waitFor(() => {
      expect(api.getHostedResourcesDiagnostics).toHaveBeenCalledTimes(1);
    });
  });

  it("shows why a disabled resource is still a warning when referenced", async () => {
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    const disabledResource = { ...resource, enabled: false };
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({
        ok: true,
        data: overview(true, [disabledResource]),
      }),
      getHostedResourcesDiagnostics: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ...diagnostics(),
          resources: [
            {
              ...diagnostics().resources[0],
              enabled: false,
              status: "disabled",
              servedOk: false,
              servedSha256: null,
            },
          ],
          references: [
            {
              resourceId: resource.id,
              serverId: "server-1",
              serverName: "The Island",
              key: "AdminListURL",
              url: resource.url,
              status: "disabled",
            },
          ],
        },
      }),
    });
    Object.defineProperty(window, "api", { configurable: true, value: api });

    render(
      <AppProviders>
        <HostedResourcesPage onOpenReference={onOpenReference} />
      </AppProviders>,
    );

    await screen.findByText("Listening");
    await user.click(screen.getByRole("button", { name: "Check health" }));
    expect(await screen.findByText("Referenced while disabled")).toBeInTheDocument();
    expect(
      screen.getByText("This resource is disabled, but RCON → Admins still references it through AdminListURL."),
    ).toBeInTheDocument();
    const referenceLink = screen.getByRole("button", { name: "The Island · RCON → Admins" });
    expect(referenceLink).toBeInTheDocument();
    await user.click(referenceLink);
    expect(onOpenReference).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: "server-1", key: "AdminListURL" }),
    );
  });
});
