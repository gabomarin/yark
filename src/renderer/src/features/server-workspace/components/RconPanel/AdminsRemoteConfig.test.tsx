import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceDto } from "@shared/ipc";
import { AdminsRemoteConfig } from "./AdminsRemoteConfig";

const ADMIN_URL = `http://127.0.0.1:8935/r/${"A".repeat(43)}`;

function adminListResource(): HostedResourceDto {
  return {
    id: "hr-admins",
    displayName: "Admins allowlist",
    format: "text",
    kind: "admin-list",
    url: ADMIN_URL,
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    revisionCount: 1,
    publishedRevisionId: "rev-1",
    publishedSequence: 1,
    publishedSha256: "a".repeat(64),
    publishedSizeBytes: 16,
    notes: "",
    tags: [],
  };
}

function setup(urlDraft = ""): ReturnType<typeof vi.fn> {
  const api = createRendererApiMock({
    getHostedResourcesOverview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        state: { enabled: true, port: 8935, bindHost: "127.0.0.1", listening: true, error: null },
        resources: [adminListResource()],
      },
    }),
  });
  Object.defineProperty(window, "api", { configurable: true, value: api });
  const onUrlChange = vi.fn();
  render(
    <AppProviders>
      <AdminsRemoteConfig
        urlDraft={urlDraft}
        intervalDraft={600}
        validating={false}
        onUrlChange={onUrlChange}
        onIntervalChange={vi.fn()}
        onValidateUrl={vi.fn()}
      />
    </AppProviders>,
  );
  return onUrlChange;
}

describe("AdminsRemoteConfig", () => {
  it("offers hosted admin-list resources for AdminListURL (#577)", async () => {
    const user = userEvent.setup();
    const onUrlChange = setup();

    await user.click(await screen.findByRole("button", { name: "Choose a YARK Hosted Resource" }));
    await user.click(await screen.findByRole("option", { name: /Admins allowlist/ }));

    expect(onUrlChange).toHaveBeenCalledWith(ADMIN_URL);
  });

  it("keeps the field read-only when the panel is read-only", async () => {
    const api = createRendererApiMock({ getHostedResourcesOverview: vi.fn() });
    Object.defineProperty(window, "api", { configurable: true, value: api });
    render(
      <AppProviders>
        <AdminsRemoteConfig
          urlDraft="https://example.com/admins.txt"
          intervalDraft={600}
          validating={false}
          readOnly
          onUrlChange={vi.fn()}
          onIntervalChange={vi.fn()}
          onValidateUrl={vi.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByRole("combobox", { name: "AdminListURL" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Validate" })).not.toBeInTheDocument();
  });
});
