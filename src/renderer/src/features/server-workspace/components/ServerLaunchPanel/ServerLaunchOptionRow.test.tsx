import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceDto } from "@shared/ipc";
import { groupStructuredOptions } from "./serverLaunchModel";
import { ServerLaunchOptionRow } from "./ServerLaunchOptionRow";

const DYNAMIC_URL = `http://127.0.0.1:8935/r/${"C".repeat(43)}`;
const NOTIFICATION_URL = `http://127.0.0.1:8935/r/${"N".repeat(43)}`;

function hostedResource(overrides: Partial<HostedResourceDto>): HostedResourceDto {
  return {
    id: "hr-1",
    displayName: "Resource",
    format: "text",
    kind: "admin-list",
    url: DYNAMIC_URL,
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    revisionCount: 1,
    publishedRevisionId: "rev-1",
    publishedSequence: 1,
    publishedSha256: "c".repeat(64),
    publishedSizeBytes: 32,
    notes: "",
    tags: [],
    ...overrides,
  };
}

function optionById(id: string) {
  const options = [...groupStructuredOptions().values()].flat();
  const option = options.find((entry) => entry.curation.id === id);
  if (option === undefined) {
    throw new Error(`catalog drift: the ${id} row is missing`);
  }
  return option;
}

function setup(optionId: string, enabled: boolean, resources: HostedResourceDto[]) {
  const api = createRendererApiMock({
    getHostedResourcesOverview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        state: { enabled: true, port: 8935, bindHost: "127.0.0.1", listening: true, error: null },
        resources,
      },
    }),
  });
  Object.defineProperty(window, "api", { configurable: true, value: api });
  const onValueChange = vi.fn();
  const utils = render(
    <AppProviders>
      <ServerLaunchOptionRow
        option={optionById(optionId)}
        selection={{ enabled, value: "" }}
        inputSize="sm"
        dependencyMet
        onEnabledChange={vi.fn()}
        onValueChange={onValueChange}
      />
    </AppProviders>,
  );
  return { onValueChange, ...utils };
}

describe("ServerLaunchOptionRow hosted resource wiring (#577)", () => {
  it("assigns a hosted dynamic-config resource to CustomDynamicConfigUrl", async () => {
    const user = userEvent.setup();
    const { onValueChange, container } = setup("customdynamicconfigurl-url", true, [
      hostedResource({ id: "hr-dynamic", displayName: "Dynamic config", format: "ini", kind: "dynamic-config" }),
    ]);

    const field = container.querySelector("[data-hosted-resource-selector]");
    expect(field).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose a YARK Hosted Resource" }));
    await user.click(await screen.findByRole("option", { name: "Dynamic config" }));

    expect(onValueChange).toHaveBeenCalledWith(DYNAMIC_URL);
  });

  it("assigns a hosted notification-url resource to CustomNotificationURL", async () => {
    const user = userEvent.setup();
    const { onValueChange, container } = setup("customnotificationurl-url", true, [
      hostedResource({
        id: "hr-notice",
        displayName: "Notice page",
        kind: "notification-url",
        url: NOTIFICATION_URL,
      }),
    ]);

    const field = container.querySelector("[data-hosted-resource-selector]");
    expect(field).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose a YARK Hosted Resource" }));
    await user.click(await screen.findByRole("option", { name: "Notice page" }));

    expect(onValueChange).toHaveBeenCalledWith(NOTIFICATION_URL);
  });

  it("keeps the selector hidden while the row is off", () => {
    const { container } = setup("customdynamicconfigurl-url", false, [
      hostedResource({ id: "hr-dynamic", displayName: "Dynamic config", format: "ini", kind: "dynamic-config" }),
    ]);
    expect(container.querySelector("[data-hosted-resource-selector]")).toBeNull();
  });
});
