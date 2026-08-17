import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  maxPlayers: 70,
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
  beforeEach(() => {
    window.api = {
      ...window.api,
      pickFolder: vi.fn(),
      cancelCloneServerCopy: vi.fn(),
      onCloneInstallProgress: vi.fn(() => () => undefined),
    } as typeof window.api;
  });

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
    expect(installDir).toHaveAttribute("aria-readonly", "true");
    expect(installDir).toHaveTextContent("C:\\ARK\\Island-copy");

    await user.clear(name);
    await user.type(name, "Winter");

    expect(installDir).toHaveTextContent("C:\\ARK\\Winter");
  });

  it("does not overwrite a Browse-customized install folder when the name changes", async () => {
    const user = userEvent.setup();
    vi.mocked(window.api.pickFolder).mockResolvedValue("D:\\Custom\\Clone");

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

    await user.click(screen.getByRole("button", { name: /Browse/i }));
    expect(screen.getByLabelText("Install directory")).toHaveTextContent(
      "D:\\Custom\\Clone",
    );

    await user.clear(name);
    await user.type(name, "Winter");

    expect(screen.getByLabelText("Install directory")).toHaveTextContent(
      "D:\\Custom\\Clone",
    );
  });

  it("keeps Copy entire server folder off by default", () => {
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

    expect(
      screen.getByRole("checkbox", { name: /Copy entire server folder/i }),
    ).not.toBeChecked();
  });

  it("sends copyInstallFolder when the operator opts in", async () => {
    const user = userEvent.setup();
    const onClone = vi.fn(async () => true);

    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          onClose={vi.fn()}
          onClone={onClone}
        />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /Copy entire server folder/i }),
    );
    await user.click(screen.getByRole("button", { name: "Clone server" }));

    expect(onClone).toHaveBeenCalledWith(
      expect.objectContaining({ copyInstallFolder: true }),
    );
  });

  it("disables folder copy when the source has no install files", async () => {
    const user = userEvent.setup();
    const onClone = vi.fn(async () => true);

    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          sourceHealth="empty"
          onClose={vi.fn()}
          onClone={onClone}
        />
      </AppProviders>,
    );

    const copy = screen.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    expect(copy).toBeDisabled();
    expect(copy).not.toBeChecked();
    expect(
      screen.getByText(/no install files yet/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clone server" }));
    expect(onClone).toHaveBeenCalledWith(
      expect.objectContaining({ copyInstallFolder: false }),
    );
  });

  it("warns when copying an incomplete install", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          sourceHealth="incomplete"
          onClose={vi.fn()}
          onClone={vi.fn(async () => true)}
        />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /Copy entire server folder/i }),
    );
    expect(
      screen.getByText(/install is incomplete/i),
    ).toBeInTheDocument();
  });

  it("blocks copy while the source server is still running", async () => {
    const user = userEvent.setup();
    const onClone = vi.fn(async () => true);

    render(
      <AppProviders>
        <CloneServerDialog
          opened
          sourceServer={source}
          sourceBusy
          onClose={vi.fn()}
          onClone={onClone}
        />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /Copy entire server folder/i }),
    );

    expect(
      screen.getByText(/before copying the entire folder/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clone server" })).toBeDisabled();
    expect(onClone).not.toHaveBeenCalled();
  });
});
