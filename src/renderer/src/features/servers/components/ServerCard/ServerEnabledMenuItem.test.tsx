import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { Menu } from "@mantine/core";
import { ServerEnabledMenuItem } from "./ServerEnabledMenuItem";

describe("ServerEnabledMenuItem", () => {
  it("blocks enable and disable while SteamCMD owns the server operation lock", () => {
    const onToggle = vi.fn();

    render(
      <AppProviders>
        <Menu opened>
          <Menu.Dropdown>
            <ServerEnabledMenuItem
              enabled
              active={false}
              steamCmdBusy
              onToggle={onToggle}
            />
          </Menu.Dropdown>
        </Menu>
      </AppProviders>,
    );

    const item = screen.getByRole("menuitem", { name: "Disable server" });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute(
      "title",
      "Another server operation is in progress",
    );
  });

  it("allows Enable even when installation files are not ready", () => {
    const onToggle = vi.fn();

    render(
      <AppProviders>
        <Menu opened>
          <Menu.Dropdown>
            <ServerEnabledMenuItem
              enabled={false}
              active={false}
              steamCmdBusy={false}
              onToggle={onToggle}
            />
          </Menu.Dropdown>
        </Menu>
      </AppProviders>,
    );

    const item = screen.getByRole("menuitem", { name: "Enable server" });
    expect(item).not.toBeDisabled();
  });
});
