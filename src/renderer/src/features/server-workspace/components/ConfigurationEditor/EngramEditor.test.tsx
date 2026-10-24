import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import {
  draftFromRow,
  namedEngramRowKey,
  NAMED_ENGRAM_CLASS_ONLY,
  UNSAFE_ENGRAM_CLASS_MESSAGE,
  reviewNamedEngramState,
  summarizeNamedEngrams,
  type NamedEngramDraft,
  type NamedEngramPendingAdd,
} from "@shared/ini/engram-named-entries";
import { setupUser } from "@renderer/test/setupUser";
import { EngramEditor } from "./EngramEditor";

const GAME = `[/Script/ShooterGame.ShooterGameMode]
bAutoUnlockAllEngrams=True
OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=False)
OverrideEngramEntries=(EngramIndex=0,EngramHidden=False)
`;

function Harness({
  gameText = GAME,
  onDraftInvalidChange,
}: {
  gameText?: string;
  onDraftInvalidChange?: (invalid: boolean) => void;
}) {
  const summary = summarizeNamedEngrams(gameText);
  const [drafts, setDrafts] = useState<Record<string, NamedEngramDraft>>(() => {
    const initial: Record<string, NamedEngramDraft> = {};
    for (const row of summary.rows) initial[namedEngramRowKey(row)] = draftFromRow(row);
    return initial;
  });
  const [pending, setPending] = useState<NamedEngramPendingAdd[]>([]);
  const review = reviewNamedEngramState(summary.rows, drafts, pending, summary.onlySpecified);
  const first = review.edits[0];
  const status =
    first?.kind === "replace"
      ? String(first.hidden)
      : first?.kind === "append"
        ? `${first.className}:${String(first.hidden)}`
        : review.blocked
          ? "blocked"
          : "clean";
  return (
    <AppProviders>
      <EngramEditor
        gameText={gameText}
        drafts={drafts}
        pending={pending}
        loading={false}
        busy={false}
        onDraftChange={(row, draft) => setDrafts((prev) => ({ ...prev, [namedEngramRowKey(row)]: draft }))}
        onPendingChange={(id, draft) =>
          setPending((prev) =>
            draft.removed
              ? prev.filter((item) => item.id !== id)
              : prev.map((item) => (item.id === id ? { ...item, draft } : item)),
          )
        }
        onAdd={(draft, listEngram) =>
          setPending((prev) => [...prev, { id: draft.className, originClass: draft.className, draft, listEngram }])
        }
        onDraftInvalidChange={onDraftInvalidChange}
      />
      <output>{status}</output>
    </AppProviders>
  );
}

describe("EngramEditor", () => {
  it("lists a named engram, warns when auto unlock is on, and counts the index line", () => {
    render(<Harness />);

    expect(screen.getByRole("textbox", { name: "Engram class name 1" })).toHaveValue("EngramEntry_Campfire_C");
    expect(screen.getByRole("alert", { name: "This list may not apply" })).toHaveTextContent(/ignores this list/i);
    expect(screen.getByText(/1 engram line was left as written/)).toBeVisible();
  });

  it("marks the line dirty when Hidden is turned on", async () => {
    const user = setupUser();
    render(<Harness />);

    expect(screen.getByRole("switch", { name: "Hide EngramEntry_Campfire_C" })).toBeVisible();
    await user.click(screen.getByRole("switch", { name: "Hide EngramEntry_Campfire_C" }));
    expect(screen.getByRole("status")).toHaveTextContent("true");
  });

  it("keeps a chosen class on the blank row until a field is set", async () => {
    const user = setupUser();
    render(<Harness />);

    await user.type(screen.getByRole("textbox", { name: "New engram class name" }), "Stone Hatchet");
    await user.click(screen.getByRole("option", { name: /Stone Hatchet/ }));

    expect(screen.getByRole("textbox", { name: "New engram class name" })).toHaveValue("EngramEntry_StoneHatchet_C");
    expect(screen.getByText(NAMED_ENGRAM_CLASS_ONLY)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("clean");

    await user.click(screen.getByRole("switch", { name: "Hide new engram" }));

    expect(screen.getByRole("textbox", { name: "New engram EngramEntry_StoneHatchet_C" })).toHaveValue(
      "EngramEntry_StoneHatchet_C",
    );
    expect(screen.getByRole("status")).toHaveTextContent("EngramEntry_StoneHatchet_C:true");
    expect(screen.getByRole("textbox", { name: "New engram class name" })).toHaveValue("");
  });

  it("keeps a display name on the blank row until a class is chosen", async () => {
    const user = setupUser();
    render(<Harness />);

    const draft = screen.getByRole("textbox", { name: "New engram class name" });
    await user.type(draft, "Campfire");
    await user.keyboard("{Enter}");

    expect(draft).toHaveValue("Campfire");
    expect(screen.getByText("Choose a match, or enter the engram class name.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("clean");
  });

  it("names spaces when the typed class is not a single token", async () => {
    const user = setupUser();
    render(<Harness />);

    const draft = screen.getByRole("textbox", { name: "New engram class name" });
    await user.type(draft, "Engram Entry");
    await user.keyboard("{Enter}");

    expect(draft).toHaveValue("Engram Entry");
    expect(screen.getByText(UNSAFE_ENGRAM_CLASS_MESSAGE)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("clean");
  });

  it("adds a custom class after a point cost is set", async () => {
    const user = setupUser();
    render(<Harness />);

    const draft = screen.getByRole("textbox", { name: "New engram class name" });
    await user.type(draft, "EngramEntry_ModThing_C");
    await user.keyboard("{Enter}");

    expect(draft).toHaveValue("EngramEntry_ModThing_C");
    expect(screen.getByRole("status")).toHaveTextContent("clean");

    await user.type(screen.getByRole("textbox", { name: "Points cost for new engram" }), "4");

    expect(screen.getByRole("textbox", { name: "New engram EngramEntry_ModThing_C" })).toHaveValue(
      "EngramEntry_ModThing_C",
    );
    expect(screen.getByRole("status")).toHaveTextContent("EngramEntry_ModThing_C:null");
  });

  it("does not add Hidden when only listed engrams are allowed", async () => {
    const user = setupUser();
    render(
      <Harness
        gameText={`[/Script/ShooterGame.ShooterGameMode]
bOnlyAllowSpecifiedEngrams=True
OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramHidden=False)
`}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "New engram class name" }), "Stone Hatchet");
    await user.click(screen.getByRole("option", { name: /Stone Hatchet/ }));

    expect(screen.getByRole("textbox", { name: "New engram class name" })).toHaveValue("EngramEntry_StoneHatchet_C");
    expect(screen.getByText(NAMED_ENGRAM_CLASS_ONLY)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("clean");
  });

  it("refuses a saved line cleared back to an empty cost and Hidden off", async () => {
    const user = setupUser();
    render(
      <Harness
        gameText={`[/Script/ShooterGame.ShooterGameMode]
OverrideNamedEngramEntries=(EngramClassName="EngramEntry_Campfire_C",EngramPointsCost=3,EngramLevelRequirement=2)
`}
      />,
    );

    const points = screen.getByRole("textbox", { name: "Points cost for EngramEntry_Campfire_C" });
    await user.clear(points);
    const level = screen.getByRole("textbox", { name: "Level requirement for EngramEntry_Campfire_C" });
    await user.clear(level);

    expect(screen.getByText(NAMED_ENGRAM_CLASS_ONLY)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("blocked");
  });

  it("marks the blank row invalid until the class is completed or cleared", async () => {
    const user = setupUser();
    const onDraftInvalidChange = vi.fn();
    render(<Harness onDraftInvalidChange={onDraftInvalidChange} />);

    await user.type(screen.getByRole("textbox", { name: "New engram class name" }), "Stone Hatchet");
    await user.click(screen.getByRole("option", { name: /Stone Hatchet/ }));
    expect(onDraftInvalidChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("switch", { name: "Hide new engram" }));
    expect(onDraftInvalidChange).toHaveBeenLastCalledWith(false);
  });

  it("replaces a saved class from the catalog search", async () => {
    const user = setupUser();
    render(<Harness />);

    const field = screen.getByRole("textbox", { name: "Engram class name 1" });
    await user.clear(field);
    await user.type(field, "Stone Hatchet");
    await user.click(screen.getByRole("option", { name: /Stone Hatchet/ }));

    expect(field).toHaveValue("EngramEntry_StoneHatchet_C");
    expect(field.closest("[data-engram-row]")).toHaveTextContent("Stone Hatchet");
  });

  it("keeps the saved class when a display name is typed into it", async () => {
    const user = setupUser();
    render(<Harness />);

    const field = screen.getByRole("textbox", { name: "Engram class name 1" });
    await user.clear(field);
    await user.type(field, "Campfire");
    await user.keyboard("{Enter}");

    expect(field).toHaveValue("Campfire");
    expect(screen.getByText("Choose a match, or enter the engram class name.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("clean");
  });
});
