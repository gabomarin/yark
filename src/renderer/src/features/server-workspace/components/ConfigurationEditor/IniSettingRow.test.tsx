import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { createRendererApiMock } from "@renderer/test/createRendererApiMock";
import type { HostedResourceKind } from "@shared/settings/hosted-resources";
import type { HostedResourceDto } from "@shared/ipc";
import type { IniSettingReference } from "../../iniModel";
import { IniSettingRow } from "./IniSettingRow";

const BAN_URL = `http://127.0.0.1:8935/r/${"B".repeat(43)}`;

function banListResource(): HostedResourceDto {
  return {
    id: "hr-bans",
    displayName: "Bans list",
    format: "text",
    kind: "ban-list",
    url: BAN_URL,
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
  };
}

function iniRow(key: string, value = ""): IniSettingReference {
  return {
    fileKey: "gameUserSettings",
    section: "ServerSettings",
    key,
    value,
    occurrence: 0,
    duplicateCount: 1,
  };
}

function setup(row: IniSettingReference, resource: HostedResourceDto | null = banListResource()) {
  const api = createRendererApiMock({
    getHostedResourcesOverview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        state: { enabled: true, port: 8935, bindHost: "127.0.0.1", listening: true, error: null },
        resources: resource === null ? [] : [resource],
      },
    }),
  });
  Object.defineProperty(window, "api", { configurable: true, value: api });
  const onUpdateValue = vi.fn();
  const utils = render(
    <AppProviders>
      <IniSettingRow row={row} busy={false} onUpdateValue={onUpdateValue} onResetRowToDefault={vi.fn()} />
    </AppProviders>,
  );
  return { onUpdateValue, ...utils };
}

describe("IniSettingRow hosted resource wiring (#577)", () => {
  it("edits BanListURL through the hosted resource selector", async () => {
    const user = userEvent.setup();
    const { onUpdateValue, container } = setup(iniRow("BanListURL"));

    const field = container.querySelector("[data-hosted-resource-selector]");
    expect(field).not.toBeNull();
    await user.click(field as HTMLElement);
    await user.click(await screen.findByRole("option", { name: "Bans list" }));

    expect(onUpdateValue).toHaveBeenCalledWith("gameUserSettings", "ServerSettings", "BanListURL", BAN_URL, 0);
  });

  it("leaves AdminListURL read-only: it is managed in RCON, not the INI editor", () => {
    const { container } = setup(iniRow("AdminListURL", '"https://example.com/admins.txt"'), null);

    expect(container.querySelector("[data-hosted-resource-selector]")).toBeNull();
    expect(screen.getByText('"https://example.com/admins.txt"')).toBeInTheDocument();
  });

  it("does not offer a resource of the wrong kind for BanListURL", () => {
    const wrongKind = { ...banListResource(), kind: "admin-list" as HostedResourceKind };
    const { container } = setup(iniRow("BanListURL"), wrongKind);

    // The field still renders (a plain URL stays valid), but nothing is offered.
    expect(container.querySelector("[data-hosted-resource-selector]")).not.toBeNull();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
