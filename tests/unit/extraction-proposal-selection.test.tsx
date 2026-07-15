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
          allItems={items}
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

  it("selects the current page before offering selection across all pages", () => {
    const allItems = [
      ...items,
      {
        id: "00000000-0000-4000-8000-000000000004",
        label: "Shipped an accessible review flow",
      },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ExtractionProposalSelection
          items={items}
          allItems={allItems}
          batchId="00000000-0000-4000-8000-000000000003"
          page={1}
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

    const selectPage = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Select all on page",
    );
    expect(selectPage).not.toBeUndefined();
    expect(container.textContent).not.toContain(
      "All pending proposals selected",
    );
    act(() => selectPage?.click());
    expect(container.textContent).toContain("2 selected");

    const selectAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Select all",
    );
    expect(selectAll).not.toBeUndefined();
    act(() => selectAll?.click());
    expect(container.textContent).toContain("3 selected");
    expect(container.textContent).toContain("All pending proposals selected");

    const approveSelected = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Approve selected",
    );
    act(() => approveSelected?.click());
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(allItems[2]!.label);
    expect(dialog?.querySelectorAll('input[name="proposalId"]')).toHaveLength(
      3,
    );

    act(() => root.unmount());
  });
});
