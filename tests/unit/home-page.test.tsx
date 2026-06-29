import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("home page", () => {
  it("describes the current foundation state without claiming product completion", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Vitae Stack" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not available in this foundation build/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/unsupported claims cannot enter a final export/i),
    ).toBeInTheDocument();
  });
});
