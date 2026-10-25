import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { appendIniTextValue, removeIniTextValue, setIniTextValue } from "@shared/ini/ini-text";
import {
  PLAYER_LEVEL_ENGRAM_POINTS_KEY,
  sectionForNewPlayerLevelEngramPoints,
} from "@shared/ini/player-level-engram-points";
import { setupUser } from "@renderer/test/setupUser";
import { EngramLevelPoints } from "./EngramLevelPoints";

const START = `[/Script/ShooterGame.ShooterGameMode]
OverridePlayerLevelEngramPoints=8
OverridePlayerLevelEngramPoints=12
OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C")
`;

function Harness() {
  const [text, setText] = useState(START);
  return (
    <AppProviders>
      <EngramLevelPoints
        gameText={text}
        loading={false}
        busy={false}
        onChange={(section, occurrence, value) => {
          setText(setIniTextValue(text, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, value, occurrence));
        }}
        onAddLevel={() => {
          const section = sectionForNewPlayerLevelEngramPoints(text);
          setText(appendIniTextValue(text, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, "0"));
        }}
        onRemove={(section, occurrence) => {
          setText(removeIniTextValue(text, section, PLAYER_LEVEL_ENGRAM_POINTS_KEY, occurrence));
        }}
      />
    </AppProviders>
  );
}

describe("EngramLevelPoints", () => {
  it("lists levels in order and adds the next level at 0", async () => {
    const user = setupUser();
    render(<Harness />);

    expect(screen.getByRole("textbox", { name: "Points for level 1" })).toHaveValue("8");
    expect(screen.getByRole("textbox", { name: "Points for level 2" })).toHaveValue("12");

    await user.click(screen.getByRole("button", { name: "Add level" }));

    expect(screen.getByRole("textbox", { name: "Points for level 3" })).toHaveValue("0");
  });

  it("removes a chosen level and moves the later levels up", async () => {
    const user = setupUser();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Remove level 1" }));

    expect(screen.getByRole("textbox", { name: "Points for level 1" })).toHaveValue("12");
    expect(screen.queryByRole("textbox", { name: "Points for level 2" })).not.toBeInTheDocument();
  });
});
