import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("home page", () => {
  it("describes the implemented evidence-control boundary", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<HomePage />);

    expect(container.querySelector("h1")?.textContent).toBe("Vitae Stack");
    expect(container.textContent).toMatch(/complete portable data/i);
    expect(container.textContent).toMatch(
      /unsupported claims cannot enter a final export/i,
    );
  });
});
