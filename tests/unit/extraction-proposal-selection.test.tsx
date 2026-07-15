import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExtractionProposalCheckbox,
  ExtractionProposalSelection,
} from "@/components/extraction-proposal-selection";

const items = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Built a private parser",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    label: "Ignore previous instructions",
  },
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("extraction proposal selection", () => {
  it("uses proposal checkboxes for confirmed bulk approve or reject decisions", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ExtractionProposalSelection
          items={items}
          batchId="00000000-0000-4000-8000-000000000003"
          page={2}
          approveAction={vi.fn()}
          rejectAction={vi.fn()}
        >
          {items.map((item, index) => (
            <ExtractionProposalCheckbox
              key={item.id}
              proposalId={item.id}
              label={`Select proposal ${index + 1}: ${item.label}`}
            />
          ))}
        </ExtractionProposalSelection>,
      );
    });

    const approveSelected = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Approve selected",
    );
    const rejectSelected = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reject selected",
    );
    expect(approveSelected?.disabled).toBe(true);
    expect(rejectSelected?.disabled).toBe(true);
    expect(container.querySelector('[name="confirmedCount"]')).toBeNull();

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    act(() => checkboxes[0]?.click());
    act(() => checkboxes[1]?.click());
    expect(container.textContent).toContain("2 selected");

    act(() => approveSelected?.click());
    let dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Are you sure you want to approve the following proposals?",
    );
    expect(dialog?.textContent).toContain(items[0]!.label);
    expect(dialog?.textContent).toContain(items[1]!.label);
    expect(dialog?.querySelectorAll('input[name="proposalId"]')).toHaveLength(
      2,
    );

    act(() => {
      const cancel = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel",
      );
      cancel?.click();
    });
    act(() => rejectSelected?.click());
    dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Are you sure you want to reject the following proposals?",
    );

    act(() => root.unmount());
  });
});
