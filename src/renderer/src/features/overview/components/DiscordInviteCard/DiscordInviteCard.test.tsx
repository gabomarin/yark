import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { DISCORD_INVITE_DISMISSED_STORAGE_KEY } from "../../model/discordInviteModel";
import { DiscordInviteCard } from "./DiscordInviteCard";

function renderCard() {
  return render(
    <AppProviders>
      <DiscordInviteCard />
    </AppProviders>,
  );
}

describe("DiscordInviteCard (#567)", () => {
  beforeEach(() => {
    window.localStorage.removeItem(DISCORD_INVITE_DISMISSED_STORAGE_KEY);
  });

  it("shows the promo card on Overview until dismissed", () => {
    renderCard();

    expect(screen.getByText("Join the YARK Discord")).toBeInTheDocument();
    expect(screen.getByText("Get help, share ARK server tips, and stay up to date.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Discord" })).toHaveAttribute("href", "https://discord.gg/DQ8nes63w7");
    expect(screen.getByRole("button", { name: "Dismiss Discord invite" })).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toHaveAccessibleName("Join the YARK Discord");
  });

  it("hides the card and persists the dismissal on close", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Dismiss Discord invite" }));

    expect(screen.queryByText("Join the YARK Discord")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISCORD_INVITE_DISMISSED_STORAGE_KEY)).toBe(JSON.stringify(true));
  });

  it("treats opening the invite as completing the one-time prompt", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("link", { name: "Open Discord" }));

    expect(screen.queryByText("Join the YARK Discord")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISCORD_INVITE_DISMISSED_STORAGE_KEY)).toBe(JSON.stringify(true));
  });

  it("does not re-prompt once the operator has dismissed it", () => {
    window.localStorage.setItem(DISCORD_INVITE_DISMISSED_STORAGE_KEY, JSON.stringify(true));

    renderCard();

    expect(screen.queryByText("Join the YARK Discord")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Discord" })).not.toBeInTheDocument();
  });
});
