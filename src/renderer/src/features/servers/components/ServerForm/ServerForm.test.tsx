import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerForm } from "./ServerForm";

describe("ServerForm", () => {
  it("renders the main fields", () => {
    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getAllByLabelText(/nombre/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/mapa/i)).toBeInTheDocument();
    expect(screen.getByText(/nuevo servidor/i)).toBeInTheDocument();
  });
});