import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceCardList } from "@/components/resource-card-list";
import {
  archivedValue,
  safeReturnPath,
  selectedIds,
  withNotice,
} from "@/modules/shared/bulk-actions";

const items = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "First project",
    href: "/career/00000000-0000-4000-8000-000000000001",
    status: "active",
    category: "project",
    deleteImpact: ["2 dependent records will also be deleted."],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Second project",
    href: "/career/00000000-0000-4000-8000-000000000002",
    status: "active",
    category: "project",
    deleteImpact: ["No dependent records will also be deleted."],
  },
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("resource card actions", () => {
  it("opens named confirmations from card icons and bulk selection", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ResourceCardList
          items={items}
          resourceName="entry"
          resourceNamePlural="entries"
          status="active"
          archiveAction={vi.fn()}
          deleteAction={vi.fn()}
          deleteWarning="This cannot be undone."
          returnPath="/career"
        />,
      );
    });

    const archiveFirst = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Archive First project"]',
    );
    act(() => archiveFirst?.click());
    let dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Are you sure you want to archive the following entry:",
    );
    expect(dialog?.textContent).toContain("First project");
    expect(dialog?.textContent).not.toContain("Second project");

    act(() => {
      const cancel = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel",
      );
      cancel?.click();
    });
    const selectAll = [...container.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("Select all entries"))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => selectAll?.click());
    expect(container.textContent).toContain("2 selected");

    const deleteSelected = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete selected"),
    );
    act(() => deleteSelected?.click());
    dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Are you sure you want to delete the following entries:",
    );
    expect(dialog?.textContent).toContain("First project");
    expect(dialog?.textContent).toContain("Second project");
    expect(dialog?.textContent).toContain(
      "2 dependent records will also be deleted.",
    );
    expect(dialog?.textContent).toContain("This cannot be undone.");
    expect(dialog?.querySelectorAll('input[name="selectedId"]')).toHaveLength(
      2,
    );

    act(() => root.unmount());
  });

  it("uses restore language for archived cards", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ResourceCardList
          items={[{ ...items[0]!, status: "archived" }]}
          resourceName="document"
          resourceNamePlural="documents"
          status="archived"
          archiveAction={vi.fn()}
          returnPath="/documents?status=archived"
        />,
      );
    });
    const restore = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Restore First project"]',
    );
    expect(restore).not.toBeNull();
    act(() => restore?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "Are you sure you want to restore the following document:",
    );
    act(() => root.unmount());
  });
});

describe("bulk action trust-boundary parsing", () => {
  it("accepts unique UUID selections and a route-scoped return path", () => {
    const form = new FormData();
    form.append("selectedId", items[0]!.id);
    form.append("selectedId", items[1]!.id);
    form.append("archived", "true");
    form.append("returnPath", "/career?status=archived&page=2");
    expect(selectedIds(form)).toEqual([items[0]!.id, items[1]!.id]);
    expect(archivedValue(form)).toBe(true);
    expect(safeReturnPath(form, "/career", "/career")).toBe(
      "/career?status=archived&page=2",
    );
    expect(withNotice("/career?status=archived", "restored")).toBe(
      "/career?status=archived&notice=restored",
    );
  });

  it("rejects malformed identifiers and external return paths", () => {
    const form = new FormData();
    form.append("selectedId", "not-an-identifier");
    form.append("returnPath", "//example.test/career");
    expect(() => selectedIds(form)).toThrow();
    expect(safeReturnPath(form, "/career", "/career")).toBe("/career");
  });
});
