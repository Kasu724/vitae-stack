"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { careerEntryTypes } from "../domain";
import type {
  CareerEntryFormFields,
  CareerEntryFormState,
} from "../form-validation";
import type { CareerEntryRecord } from "../repository";

function inputDate(
  entry: CareerEntryRecord | undefined,
  side: "start" | "end",
) {
  const value = side === "start" ? entry?.start_date : entry?.end_date;
  const precision =
    side === "start" ? entry?.start_date_precision : entry?.end_date_precision;
  if (!value || !precision) return "";
  return precision === "year"
    ? value.slice(0, 4)
    : precision === "month"
      ? value.slice(0, 7)
      : value;
}

function initialFields(entry?: CareerEntryRecord): CareerEntryFormFields {
  return {
    type: entry?.type ?? "work",
    title: entry?.title ?? "",
    organization: entry?.organization ?? "",
    location: entry?.location ?? "",
    description: entry?.description ?? "",
    startDate: inputDate(entry, "start"),
    endDate: inputDate(entry, "end"),
    isCurrent: entry?.is_current ?? false,
    tags: entry?.tags.join(", ") ?? "",
    major: entry?.attributes?.major ?? "",
    minor: entry?.attributes?.minor ?? "",
    relevantCourses: entry?.attributes?.relevantCourses?.join("\n") ?? "",
    awards: entry?.attributes?.awards?.join("\n") ?? "",
    technologies: entry?.attributes?.technologies?.join(", ") ?? "",
  };
}

const fieldLabels: Record<keyof CareerEntryFormFields, string> = {
  type: "Entry type",
  title: "Title",
  organization: "Organization",
  location: "Location",
  description: "Description",
  startDate: "Start date",
  endDate: "End date",
  isCurrent: "Current entry",
  tags: "Tags",
  major: "Major",
  minor: "Minor",
  relevantCourses: "Relevant courses",
  awards: "Awards",
  technologies: "Technologies",
};

function itemLabels(type: string): { title: string; organization: string } {
  if (type === "education" || type === "coursework")
    return { title: "Degree or program", organization: "School" };
  if (type === "project")
    return { title: "Project name", organization: "Organization (optional)" };
  if (type === "certification")
    return { title: "Certification", organization: "Issuer" };
  if (type === "publication")
    return { title: "Publication title", organization: "Publisher" };
  return { title: "Role or item name", organization: "Organization" };
}

export function EntryForm({
  entry,
  action,
}: {
  entry?: CareerEntryRecord;
  action: (
    previous: CareerEntryFormState,
    form: FormData,
  ) => Promise<CareerEntryFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    fields: initialFields(entry),
    errors: {},
    message: null,
    attempt: 0,
  });
  const [localFields, setLocalFields] = useState({
    attempt: state.attempt,
    fields: state.fields,
  });
  const fields =
    localFields.attempt === state.attempt ? localFields.fields : state.fields;
  const summary = useRef<HTMLDivElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.attempt > 0) summary.current?.focus();
  }, [state.attempt]);
  useEffect(() => {
    if (descriptionInput.current)
      descriptionInput.current.defaultValue = fields.description;
  }, [fields.description]);
  const setField = <Field extends keyof CareerEntryFormFields>(
    field: Field,
    value: CareerEntryFormFields[Field],
  ) =>
    setLocalFields((current) => ({
      attempt: state.attempt,
      fields: {
        ...(current.attempt === state.attempt ? current.fields : state.fields),
        [field]: value,
      },
    }));
  const error = (field: keyof CareerEntryFormFields) =>
    state.errors[field]?.join(" ");
  const invalidFields = Object.keys(state.errors) as Array<
    keyof CareerEntryFormFields
  >;
  const labels = itemLabels(fields.type);
  const showEducationFields =
    fields.type === "education" || fields.type === "coursework";
  const showTechnologies = [
    "project",
    "research",
    "coursework",
    "publication",
  ].includes(fields.type);

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="revision" value={entry.revision} />
        </>
      ) : null}
      {state.message ? (
        <div
          ref={summary}
          className="rounded-lg border border-[var(--danger)] p-4"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">{state.message}</p>
          {invalidFields.length ? (
            <ul className="mt-2 list-disc pl-5">
              {invalidFields.map((field) => (
                <li key={field}>
                  <a href={`#career-${field}`}>{fieldLabels[field]}</a>:{" "}
                  {error(field)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-1 font-medium" htmlFor="career-type">
          Entry type
          <select
            id="career-type"
            name="type"
            value={fields.type}
            onChange={(event) => setField("type", event.currentTarget.value)}
            required
            className="field"
            aria-invalid={Boolean(error("type"))}
            aria-describedby={error("type") ? "career-type-error" : undefined}
          >
            {careerEntryTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {error("type") ? (
            <span
              id="career-type-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("type")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 font-medium" htmlFor="career-title">
          {labels.title}
          <input
            id="career-title"
            name="title"
            value={fields.title}
            onChange={(event) => setField("title", event.currentTarget.value)}
            required
            maxLength={200}
            className="field"
            aria-invalid={Boolean(error("title"))}
            aria-describedby={error("title") ? "career-title-error" : undefined}
          />
          {error("title") ? (
            <span
              id="career-title-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("title")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 font-medium" htmlFor="career-organization">
          {labels.organization}
          <input
            id="career-organization"
            name="organization"
            value={fields.organization}
            onChange={(event) =>
              setField("organization", event.currentTarget.value)
            }
            maxLength={2000}
            className="field"
            aria-invalid={Boolean(error("organization"))}
            aria-describedby={
              error("organization") ? "career-organization-error" : undefined
            }
          />
          {error("organization") ? (
            <span
              id="career-organization-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("organization")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 font-medium" htmlFor="career-location">
          Location
          <input
            id="career-location"
            name="location"
            value={fields.location}
            onChange={(event) =>
              setField("location", event.currentTarget.value)
            }
            maxLength={2000}
            className="field"
            aria-invalid={Boolean(error("location"))}
            aria-describedby={
              error("location") ? "career-location-error" : undefined
            }
          />
          {error("location") ? (
            <span
              id="career-location-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("location")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 font-medium" htmlFor="career-startDate">
          Start date{" "}
          <span className="text-sm font-normal text-[var(--muted)]">
            YYYY, YYYY-MM, or YYYY-MM-DD
          </span>
          <input
            id="career-startDate"
            name="startDate"
            value={fields.startDate}
            onChange={(event) =>
              setField("startDate", event.currentTarget.value)
            }
            inputMode="numeric"
            pattern="[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?"
            className="field"
            aria-invalid={Boolean(error("startDate"))}
            aria-describedby={
              error("startDate") ? "career-startDate-error" : undefined
            }
          />
          {error("startDate") ? (
            <span
              id="career-startDate-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("startDate")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 font-medium" htmlFor="career-endDate">
          End date{" "}
          <span className="text-sm font-normal text-[var(--muted)]">
            Leave blank if current
          </span>
          <input
            id="career-endDate"
            name="endDate"
            value={fields.endDate}
            onChange={(event) => setField("endDate", event.currentTarget.value)}
            inputMode="numeric"
            pattern="[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?"
            className="field"
            disabled={fields.isCurrent}
            aria-invalid={Boolean(error("endDate"))}
            aria-describedby={
              error("endDate") ? "career-endDate-error" : undefined
            }
          />
          {error("endDate") ? (
            <span
              id="career-endDate-error"
              className="text-sm text-[var(--danger)]"
            >
              {error("endDate")}
            </span>
          ) : null}
        </label>
      </div>
      <label
        id="career-isCurrent"
        className="flex items-center gap-2 font-medium"
      >
        <input
          type="checkbox"
          name="isCurrent"
          checked={fields.isCurrent}
          onChange={(event) =>
            setField("isCurrent", event.currentTarget.checked)
          }
        />{" "}
        This is current
      </label>
      {showEducationFields ? (
        <fieldset className="grid gap-4 rounded-lg border border-[var(--border)] p-4 sm:grid-cols-2">
          <legend className="px-1 font-semibold">Education details</legend>
          <label className="grid gap-1 font-medium" htmlFor="career-major">
            Major
            <input
              id="career-major"
              name="major"
              value={fields.major}
              onChange={(event) => setField("major", event.currentTarget.value)}
              maxLength={500}
              className="field"
            />
          </label>
          <label className="grid gap-1 font-medium" htmlFor="career-minor">
            Minor
            <input
              id="career-minor"
              name="minor"
              value={fields.minor}
              onChange={(event) => setField("minor", event.currentTarget.value)}
              maxLength={500}
              className="field"
            />
          </label>
          <label
            className="grid gap-1 font-medium"
            htmlFor="career-relevantCourses"
          >
            Relevant courses
            <span className="text-sm font-normal text-[var(--muted)]">
              One per line
            </span>
            <textarea
              id="career-relevantCourses"
              name="relevantCourses"
              value={fields.relevantCourses}
              onChange={(event) =>
                setField("relevantCourses", event.currentTarget.value)
              }
              rows={4}
              className="field"
            />
          </label>
          <label className="grid gap-1 font-medium" htmlFor="career-awards">
            Awards and honors
            <span className="text-sm font-normal text-[var(--muted)]">
              One per line
            </span>
            <textarea
              id="career-awards"
              name="awards"
              value={fields.awards}
              onChange={(event) =>
                setField("awards", event.currentTarget.value)
              }
              rows={4}
              className="field"
            />
          </label>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="major" value={fields.major} />
          <input type="hidden" name="minor" value={fields.minor} />
          <input
            type="hidden"
            name="relevantCourses"
            value={fields.relevantCourses}
          />
          <input type="hidden" name="awards" value={fields.awards} />
        </>
      )}
      {showTechnologies ? (
        <label className="grid gap-1 font-medium" htmlFor="career-technologies">
          Technologies
          <span className="text-sm font-normal text-[var(--muted)]">
            Comma-separated
          </span>
          <input
            id="career-technologies"
            name="technologies"
            value={fields.technologies}
            onChange={(event) =>
              setField("technologies", event.currentTarget.value)
            }
            className="field"
          />
        </label>
      ) : (
        <input type="hidden" name="technologies" value={fields.technologies} />
      )}
      <label className="grid gap-1 font-medium" htmlFor="career-description">
        Item notes
        <span className="text-sm font-normal text-[var(--muted)]">
          Organizing notes are not generation evidence. Add factual bullets or
          detailed context below and approve them before AI can use them.
        </span>
        <textarea
          ref={descriptionInput}
          id="career-description"
          name="description"
          value={fields.description}
          onChange={(event) => {
            event.currentTarget.defaultValue = event.currentTarget.value;
            setField("description", event.currentTarget.value);
          }}
          rows={5}
          maxLength={20000}
          className="field"
          aria-invalid={Boolean(error("description"))}
          aria-describedby={
            error("description") ? "career-description-error" : undefined
          }
        />
        {error("description") ? (
          <span
            id="career-description-error"
            className="text-sm text-[var(--danger)]"
          >
            {error("description")}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 font-medium" htmlFor="career-tags">
        Tags{" "}
        <span className="text-sm font-normal text-[var(--muted)]">
          Comma-separated
        </span>
        <input
          id="career-tags"
          name="tags"
          value={fields.tags}
          onChange={(event) => setField("tags", event.currentTarget.value)}
          className="field"
          aria-invalid={Boolean(error("tags"))}
          aria-describedby={error("tags") ? "career-tags-error" : undefined}
        />
        {error("tags") ? (
          <span id="career-tags-error" className="text-sm text-[var(--danger)]">
            {error("tags")}
          </span>
        ) : null}
      </label>
      <button type="submit" className="button w-fit" disabled={pending}>
        {pending ? "Saving…" : entry ? "Save entry" : "Create entry"}
      </button>
    </form>
  );
}
