import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("home page", () => {
  it("describes the implemented evidence-control boundary", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Vitae Stack" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/complete portable data/i)).toBeInTheDocument();
    expect(
      screen.getByText(/unsupported claims cannot enter a final export/i),
    ).toBeInTheDocument();
  });
});
