import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceDto, HostedResourcesOverviewDto } from "@shared/ipc";
import { ADMIN_LIST_URL_CONSUMER } from "@shared/settings/hosted-resource-consumers";
import { HostedResourceSelector } from "./HostedResourceSelector";

const TOKEN = "A".repeat(43);
const URL_FOR_TOKEN = `http://127.0.0.1:8935/r/${TOKEN}`;

function overview(resources: HostedResourceDto[], enabled = true): HostedResourcesOverviewDto {
  return {
    state: { enabled, port: 8935, bindHost: "127.0.0.1", listening: enabled, error: null },
    resources,
  };
}

function dto(overrides: Partial<HostedResourceDto> = {}): HostedResourceDto {
  return {
    id: "hr-1",
    displayName: "Admins allowlist",
    format: "text",
    kind: "admin-list",
    url: URL_FOR_TOKEN,
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    revisionCount: 1,
    publishedRevisionId: "rev-1",
    publishedSequence: 1,
    publishedSha256: "b".repeat(64),
    publishedSizeBytes: 16,
    notes: "",
    tags: [],
    ...overrides,
  };
}

function renderSelector(api: ReturnType<typeof createRendererApiMock>, value: string, onChange = vi.fn()) {
  Object.defineProperty(window, "api", { configurable: true, value: api });

  function SelectorHarness() {
    const [currentValue, setCurrentValue] = useState(value);
    return (
      <HostedResourceSelector
        consumer={ADMIN_LIST_URL_CONSUMER}
        value={currentValue}
        onChange={(nextValue) => {
          setCurrentValue(nextValue);
          onChange(nextValue);
        }}
      />
    );
  }

  render(
    <AppProviders>
      <SelectorHarness />
    </AppProviders>,
  );
  return onChange;
}

describe("HostedResourceSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("assigns a compatible resource chosen from the dropdown", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([dto()]) }),
    });
    const onChange = renderSelector(api, "");

    await screen.findByRole("combobox", { name: "AdminListURL" });
    await user.click(await screen.findByRole("button", { name: "Choose a YARK Hosted Resource" }));
    await user.click(await screen.findByRole("option", { name: /Admins allowlist/ }));

    expect(onChange).toHaveBeenCalledWith(URL_FOR_TOKEN);
  });

  it("does not offer disabled or wrongly typed resources", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({
        ok: true,
        data: overview([dto({ id: "off", displayName: "Off", enabled: false }), dto({ id: "ban", kind: "ban-list" })]),
      }),
    });
    renderSelector(api, "");

    await user.click(await screen.findByRole("button", { name: "Choose a YARK Hosted Resource" }));
    expect(screen.queryByRole("option", { name: "Off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admins allowlist" })).not.toBeInTheDocument();
    expect(screen.getByText(/No enabled admin list resource yet/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create admin list resource" })).toBeInTheDocument();
  });

  it("warns when the value points at a resource that is no longer servable", async () => {
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({
        ok: true,
        data: overview([dto({ enabled: false })]),
      }),
    });
    renderSelector(api, URL_FOR_TOKEN);

    expect(await screen.findByText(/is disabled, so ASA cannot fetch this URL/i)).toBeInTheDocument();
  });

  it("holds back the 'missing' warning until the catalog has loaded", async () => {
    const api = createRendererApiMock({
      // Never resolves: "not listed yet" must not be reported as "deleted".
      getHostedResourcesOverview: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderSelector(api, URL_FOR_TOKEN);

    expect(await screen.findByRole("combobox", { name: "AdminListURL" })).toBeInTheDocument();
    expect(screen.queryByText(/no current resource serves it/i)).not.toBeInTheDocument();
  });

  it("accepts a freely typed URL and explains hosted resources are optional", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([]) }),
    });
    const onChange = renderSelector(api, "");
    const field = await screen.findByRole("combobox", { name: "AdminListURL" });

    expect(screen.getByText("Type a URL or select a YARK Hosted Resource.")).toBeInTheDocument();
    await user.type(field, "https://example.com/admins.txt");

    expect(onChange).toHaveBeenLastCalledWith("https://example.com/admins.txt");
  });

  it("opens the resource list only from the Resources button", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({
        ok: true,
        data: overview([
          dto({ displayName: "AdminList" }),
          dto({ id: "other", displayName: "Notifications", url: `http://127.0.0.1:8935/r/${"B".repeat(43)}` }),
        ]),
      }),
    });
    renderSelector(api, "");
    const field = await screen.findByRole("combobox", { name: "AdminListURL" });

    // Focusing or typing must not replace a hand-typed URL with a highlighted option.
    await user.click(field);
    await user.type(field, "Ad");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(field).toHaveValue("Ad");

    // The button lists every compatible resource, whatever the field holds.
    await user.click(screen.getByRole("button", { name: "Choose a YARK Hosted Resource" }));
    expect(await screen.findByRole("option", { name: /AdminList/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Notifications/ })).toBeInTheDocument();
  });

  it("closes the resource list when the field is focused for editing", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([dto()]) }),
    });
    renderSelector(api, "");
    const field = await screen.findByRole("combobox", { name: "AdminListURL" });

    await user.click(screen.getByRole("button", { name: "Choose a YARK Hosted Resource" }));
    expect(field).toHaveAttribute("aria-expanded", "true");

    await user.click(field);
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the resource list from the field with the keyboard", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([dto()]) }),
    });
    renderSelector(api, "");
    const field = await screen.findByRole("combobox", { name: "AdminListURL" });

    await user.click(field);
    await user.keyboard("{ArrowDown}");

    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("option", { name: /Admins allowlist/ })).toBeInTheDocument();
  });

  it("offers a pre-filled create flow when empty and assigns the new URL", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([]) }),
      createHostedResource: vi.fn().mockResolvedValue({
        ok: true,
        data: dto({ id: "new", displayName: "AdminListURL" }),
      }),
    });
    const onChange = renderSelector(api, "");

    await user.click(await screen.findByRole("button", { name: "Choose a YARK Hosted Resource" }));
    await user.click(await screen.findByRole("option", { name: "Create admin list resource" }));
    // The modal mounts one transition tick after the click.
    expect(await screen.findByLabelText(/display name/i)).toHaveValue("Admin list");
    // Mantine's Select labels both the input and its listbox, so pin the query to the input.
    const format = screen.getByLabelText("Format", { selector: "input" });
    expect(format).toHaveValue("Plain text");
    expect(format).toBeDisabled();

    await user.type(screen.getByLabelText("Resource content"), "EOSID1");
    await user.click(screen.getByRole("button", { name: "Create resource" }));

    await waitFor(() => {
      expect(api.createHostedResource).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Admin list", format: "text", kind: "admin-list" }),
      );
      // The selector refetches the catalog before applying the URL, so the value lands a
      // tick later than the create call.
      expect(onChange).toHaveBeenCalledWith(URL_FOR_TOKEN);
    });
  });

  it("notes that the host is off while still allowing creation", async () => {
    const user = userEvent.setup();
    const api = createRendererApiMock({
      getHostedResourcesOverview: vi.fn().mockResolvedValue({ ok: true, data: overview([], false) }),
    });
    renderSelector(api, "");

    expect(await screen.findByText(/the URL starts serving once you turn it on/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose a YARK Hosted Resource" }));
    expect(await screen.findByRole("option", { name: "Create admin list resource" })).toBeInTheDocument();
  });
});
