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
              installationReady
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
});
