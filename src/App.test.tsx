import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
});

describe("<App />", () => {
  it("renders the task board heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /ly task board/i }),
    ).toBeInTheDocument();
  });

  it("adds a new task and updates the remaining count", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/new task/i), "Write tests");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText("Write tests")).toBeInTheDocument();
    // seed has 1 active + newly added active = 2 tasks left
    expect(screen.getByTestId("remaining-count")).toHaveTextContent(
      "2 tasks left",
    );
  });

  it("filters to active tasks only", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: /active/i }));

    const list = screen.getByRole("list");
    expect(
      within(list).queryByText("Explore the LY starter"),
    ).not.toBeInTheDocument();
    expect(within(list).getByText("Add your first task")).toBeInTheDocument();
  });
});
