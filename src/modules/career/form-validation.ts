import type { CareerEntryInput, FactProposalInput } from "./domain";
import {
  careerEntryInputSchema,
  factProposalInputSchema,
  parseTags,
} from "./domain";

export interface CareerEntryFormFields {
  type: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  tags: string;
  major: string;
  minor: string;
  relevantCourses: string;
  awards: string;
  technologies: string;
}

export interface FactFormFields {
  factType: string;
  displayText: string;
  metricValue: string;
  metricUnit: string;
  metricContext: string;
}

export type FormErrors<Fields> = Partial<Record<keyof Fields, string[]>>;

export interface CareerEntryFormState {
  fields: CareerEntryFormFields;
  errors: FormErrors<CareerEntryFormFields>;
  message: string | null;
  attempt: number;
}

export interface FactFormState {
  fields: FactFormFields;
  errors: FormErrors<FactFormFields>;
  message: string | null;
  attempt: number;
}

export interface ParsedForm<Fields, Value> {
  fields: Fields;
  value?: Value;
  errors: FormErrors<Fields>;
}

function rawText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function addError<Fields>(
  errors: FormErrors<Fields>,
  field: keyof Fields,
  message: string,
): void {
  const current = errors[field] ?? [];
  current.push(message);
  errors[field] = current;
}

export function parseCareerEntryForm(
  form: FormData,
): ParsedForm<CareerEntryFormFields, CareerEntryInput> {
  const fields: CareerEntryFormFields = {
    type: rawText(form, "type"),
    title: rawText(form, "title"),
    organization: rawText(form, "organization"),
    location: rawText(form, "location"),
    description: rawText(form, "description"),
    startDate: rawText(form, "startDate"),
    endDate: rawText(form, "endDate"),
    isCurrent: form.get("isCurrent") === "on",
    tags: rawText(form, "tags"),
    major: rawText(form, "major"),
    minor: rawText(form, "minor"),
    relevantCourses: rawText(form, "relevantCourses"),
    awards: rawText(form, "awards"),
    technologies: rawText(form, "technologies"),
  };
  const parsed = careerEntryInputSchema.safeParse({
    ...fields,
    tags: parseTags(fields.tags),
    attributes: {
      major: fields.major,
      minor: fields.minor,
      relevantCourses: parseLines(fields.relevantCourses),
      awards: parseLines(fields.awards),
      technologies: parseCommaList(fields.technologies),
    },
  });
  const errors: FormErrors<CareerEntryFormFields> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field =
        issue.path[0] === "attributes" ? issue.path[1] : issue.path[0];
      if (typeof field === "string" && field in fields)
        addError(errors, field as keyof CareerEntryFormFields, issue.message);
    }
    return { fields, errors };
  }
  return { fields, value: parsed.data, errors };
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseFactForm(
  form: FormData,
): ParsedForm<FactFormFields, FactProposalInput> {
  const fields: FactFormFields = {
    factType: rawText(form, "factType"),
    displayText: rawText(form, "displayText"),
    metricValue: rawText(form, "metricValue"),
    metricUnit: rawText(form, "metricUnit"),
    metricContext: rawText(form, "metricContext"),
  };
  const displayText = fields.displayText.trim();
  let value: unknown = { kind: "text", text: displayText };
  if (fields.factType === "metric") {
    value = {
      kind: "metric",
      value:
        fields.metricValue.trim() === ""
          ? Number.NaN
          : Number(fields.metricValue),
      unit: fields.metricUnit,
      context: fields.metricContext,
    };
  } else if (fields.factType === "skill") {
    value = { kind: "skill", name: displayText };
  } else if (fields.factType === "date") {
    value = {
      kind: "date",
      value: displayText,
      precision:
        displayText.length === 4
          ? "year"
          : displayText.length === 7
            ? "month"
            : "day",
    };
  }
  const parsed = factProposalInputSchema.safeParse({
    type: fields.factType,
    value,
    displayText,
    sourceLocator: { kind: "manual", label: "Manual entry" },
  });
  const errors: FormErrors<FactFormFields> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      const field: keyof FactFormFields = path.startsWith("value.value")
        ? fields.factType === "date"
          ? "displayText"
          : "metricValue"
        : path.startsWith("value.unit")
          ? "metricUnit"
          : path.startsWith("value.context")
            ? "metricContext"
            : path.startsWith("value.name") || path.startsWith("value.text")
              ? "displayText"
              : path.startsWith("type")
                ? "factType"
                : "displayText";
      addError(errors, field, issue.message);
    }
    return { fields, errors };
  }
  return { fields, value: parsed.data, errors };
}
