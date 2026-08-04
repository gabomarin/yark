import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import type { ServerProfile } from "@shared/types";
import { CloneServerDialog } from "./CloneServerDialog";

const source: ServerProfile = {
  id: "srv-1",
  name: "Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\Island",
  enabled: false,
  autoStart: false,
  sessionName: "Island Session",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("CloneServerDialog", () => {
  it("keeps the suggested install folder aligned with name edits", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          onClose={vi.fn()}
          onClone={vi.fn(async () => true)}
        />
      </AppProviders>,
    );

    const name = screen.getByRole("textbox", { name: "Server name" });
    const installDir = screen.getByRole("textbox", { name: "Install directory" });
    expect(installDir).toHaveValue("C:\\ARK\\Island-copy");

    await user.clear(name);
    await user.type(name, "Winter");

    expect(installDir).toHaveValue("C:\\ARK\\Winter");
  });

  it("does not overwrite a manually customized install folder", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          onClose={vi.fn()}
          onClone={vi.fn(async () => true)}
        />
      </AppProviders>,
    );

    const name = screen.getByRole("textbox", { name: "Server name" });
    const installDir = screen.getByRole("textbox", { name: "Install directory" });
    await user.clear(installDir);
    await user.type(installDir, "D:\\Custom\\Clone");
    await user.clear(name);
    await user.type(name, "Winter");

    expect(installDir).toHaveValue("D:\\Custom\\Clone");
  });
});
