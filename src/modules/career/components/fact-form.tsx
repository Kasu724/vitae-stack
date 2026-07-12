"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import type { FactFormFields, FactFormState } from "../form-validation";

const fieldLabels: Record<keyof FactFormFields, string> = {
  factType: "Fact type",
  displayText: "Claim or value",
  metricValue: "Numeric value",
  metricUnit: "Metric unit",
  metricContext: "Metric context",
};

export function FactForm({
  action,
  entryId,
  factId,
  submitLabel,
}: {
  action: (previous: FactFormState, form: FormData) => Promise<FactFormState>;
  entryId: string;
  factId?: string;
  submitLabel: string;
}) {
  const prefix = `fact-${useId().replaceAll(":", "")}`;
  const [state, formAction, pending] = useActionState(action, {
    fields: {
      factType: "statement",
      displayText: "",
      metricValue: "",
      metricUnit: "",
      metricContext: "",
    },
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
  const displayTextInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.attempt > 0) summary.current?.focus();
  }, [state.attempt]);
  useEffect(() => {
    if (displayTextInput.current)
      displayTextInput.current.defaultValue = fields.displayText;
  }, [fields.displayText]);
  const setField = <Field extends keyof FactFormFields>(
    field: Field,
    value: FactFormFields[Field],
  ) =>
    setLocalFields((current) => ({
      attempt: state.attempt,
      fields: {
        ...(current.attempt === state.attempt ? current.fields : state.fields),
        [field]: value,
      },
    }));
  const error = (field: keyof FactFormFields) => state.errors[field]?.join(" ");
  const invalidFields = Object.keys(state.errors) as Array<
    keyof FactFormFields
  >;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="entryId" value={entryId} />
      {factId ? <input type="hidden" name="factId" value={factId} /> : null}
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
                  <a href={`#${prefix}-${field}`}>{fieldLabels[field]}</a>:{" "}
                  {error(field)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <label className="grid gap-1 font-medium" htmlFor={`${prefix}-factType`}>
        Fact type
        <select
          id={`${prefix}-factType`}
          name="factType"
          className="field"
          value={fields.factType}
          onChange={(event) => setField("factType", event.currentTarget.value)}
          aria-invalid={Boolean(error("factType"))}
          aria-describedby={
            error("factType") ? `${prefix}-factType-error` : undefined
          }
        >
          <option value="statement">Statement</option>
          <option value="accomplishment">Accomplishment</option>
          <option value="education">Education</option>
          <option value="metric">Metric</option>
          <option value="date">Date</option>
          <option value="skill">Skill</option>
          <option value="custom">Custom</option>
        </select>
        {error("factType") ? (
          <span
            id={`${prefix}-factType-error`}
            className="text-sm text-[var(--danger)]"
          >
            {error("factType")}
          </span>
        ) : null}
      </label>
      <label
        className="grid gap-1 font-medium"
        htmlFor={`${prefix}-displayText`}
      >
        {fields.factType === "date" ? "Date value" : "Claim or value"}
        {fields.factType === "date" ? (
          <span className="text-sm font-normal text-[var(--muted)]">
            Use YYYY, YYYY-MM, or YYYY-MM-DD.
          </span>
        ) : null}
        <textarea
          ref={displayTextInput}
          id={`${prefix}-displayText`}
          name="displayText"
          className="field"
          rows={3}
          required
          maxLength={5000}
          value={fields.displayText}
          onChange={(event) => {
            event.currentTarget.defaultValue = event.currentTarget.value;
            setField("displayText", event.currentTarget.value);
          }}
          aria-invalid={Boolean(error("displayText"))}
          aria-describedby={
            error("displayText") ? `${prefix}-displayText-error` : undefined
          }
        />
        {error("displayText") ? (
          <span
            id={`${prefix}-displayText-error`}
            className="text-sm text-[var(--danger)]"
          >
            {error("displayText")}
          </span>
        ) : null}
      </label>
      <fieldset
        className="grid gap-3 rounded-lg border border-[var(--border)] p-4"
        disabled={fields.factType !== "metric"}
      >
        <legend className="px-1 font-medium">
          Metric details{" "}
          {fields.factType === "metric" ? "(required)" : "(not used)"}
        </legend>
        <label className="grid gap-1" htmlFor={`${prefix}-metricValue`}>
          Numeric value
          <input
            id={`${prefix}-metricValue`}
            name="metricValue"
            className="field"
            type="number"
            step="any"
            required={fields.factType === "metric"}
            value={fields.metricValue}
            onChange={(event) =>
              setField("metricValue", event.currentTarget.value)
            }
            aria-invalid={Boolean(error("metricValue"))}
            aria-describedby={
              error("metricValue") ? `${prefix}-metricValue-error` : undefined
            }
          />
          {error("metricValue") ? (
            <span
              id={`${prefix}-metricValue-error`}
              className="text-sm text-[var(--danger)]"
            >
              {error("metricValue")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1" htmlFor={`${prefix}-metricUnit`}>
          Unit
          <input
            id={`${prefix}-metricUnit`}
            name="metricUnit"
            className="field"
            placeholder="%, users, USD"
            required={fields.factType === "metric"}
            maxLength={100}
            value={fields.metricUnit}
            onChange={(event) =>
              setField("metricUnit", event.currentTarget.value)
            }
            aria-invalid={Boolean(error("metricUnit"))}
            aria-describedby={
              error("metricUnit") ? `${prefix}-metricUnit-error` : undefined
            }
          />
          {error("metricUnit") ? (
            <span
              id={`${prefix}-metricUnit-error`}
              className="text-sm text-[var(--danger)]"
            >
              {error("metricUnit")}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1" htmlFor={`${prefix}-metricContext`}>
          Context
          <input
            id={`${prefix}-metricContext`}
            name="metricContext"
            className="field"
            required={fields.factType === "metric"}
            maxLength={1000}
            value={fields.metricContext}
            onChange={(event) =>
              setField("metricContext", event.currentTarget.value)
            }
            aria-invalid={Boolean(error("metricContext"))}
            aria-describedby={
              error("metricContext")
                ? `${prefix}-metricContext-error`
                : undefined
            }
          />
          {error("metricContext") ? (
            <span
              id={`${prefix}-metricContext-error`}
              className="text-sm text-[var(--danger)]"
            >
              {error("metricContext")}
            </span>
          ) : null}
        </label>
      </fieldset>
      <button className="button w-fit" type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
