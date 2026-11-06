import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Setup } from "./Setup";
import { useBooth } from "../stores/booth";
describe("booth setup", () => {
  it("lets a guest choose a supported capture sequence without an account", () => {
    render(
      <MemoryRouter>
        <Setup />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "6 shots" }));
    fireEvent.click(screen.getByRole("button", { name: "10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: /little postcard/ }));
    expect(useBooth.getState().settings).toEqual({
      count: 6,
      countdown: 10,
      template: "postcard",
    });
    expect(screen.getByRole("button", { name: /Open my booth/ })).toBeEnabled();
  });
});
