import { describe, expect, it } from "vitest";

import {
  parseCareerEntryForm,
  parseFactForm,
} from "@/modules/career/form-validation";

function entryForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields = {
    type: "work",
    title: "Synthetic role",
    organization: "Example",
    location: "Remote",
    description: "Synthetic description",
    startDate: "2024-01",
    endDate: "2025-01",
    tags: "typescript, local",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe("career form validation", () => {
  it("preserves invalid calendar values and links the error to the field", () => {
    const parsed = parseCareerEntryForm(entryForm({ startDate: "2024-02-30" }));
    expect(parsed.value).toBeUndefined();
    expect(parsed.fields.startDate).toBe("2024-02-30");
    expect(parsed.errors.startDate).toContain("Enter a valid calendar date.");
  });

  it("rejects reversed dates and current entries with an end date", () => {
    const reversed = parseCareerEntryForm(
      entryForm({ startDate: "2025-01", endDate: "2024-01" }),
    );
    expect(reversed.errors.endDate).toContain(
      "The end date cannot be earlier than the start date.",
    );

    const currentForm = entryForm();
    currentForm.set("isCurrent", "on");
    const current = parseCareerEntryForm(currentForm);
    expect(current.errors.endDate).toContain(
      "A current entry cannot have an end date.",
    );
  });

  it("requires every metric component and accepts a complete finite metric", () => {
    const incomplete = new FormData();
    incomplete.set("factType", "metric");
    incomplete.set("displayText", "Improved completion by 20%");
    expect(parseFactForm(incomplete)).toMatchObject({
      fields: { displayText: "Improved completion by 20%" },
      errors: {
        metricValue: expect.any(Array),
        metricUnit: expect.any(Array),
        metricContext: expect.any(Array),
      },
    });

    incomplete.set("metricValue", "20");
    incomplete.set("metricUnit", "%");
    incomplete.set("metricContext", "onboarding completion");
    expect(parseFactForm(incomplete).value).toMatchObject({
      value: {
        kind: "metric",
        value: 20,
        unit: "%",
        context: "onboarding completion",
      },
    });
  });
});
