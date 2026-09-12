import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("<App />", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /LY Task Board/i }),
    ).toBeInTheDocument();
  });

  it("adds a new task through the form", () => {
    render(<App />);
    const input = screen.getByLabelText(/new task/i);
    fireEvent.change(input, { target: { value: "Demo task" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText("Demo task")).toBeInTheDocument();
  });
});
