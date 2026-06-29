import { careerEntryTypes } from "../domain";
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

export function EntryForm({
  entry,
  action,
}: {
  entry?: CareerEntryRecord;
  action: (form: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-5">
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="revision" value={entry.revision} />
        </>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-1 font-medium">
          Entry type
          <select
            name="type"
            defaultValue={entry?.type ?? "work"}
            required
            className="field"
          >
            {careerEntryTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-medium">
          Title
          <input
            name="title"
            defaultValue={entry?.title ?? ""}
            required
            maxLength={200}
            className="field"
          />
        </label>
        <label className="grid gap-1 font-medium">
          Organization
          <input
            name="organization"
            defaultValue={entry?.organization ?? ""}
            maxLength={2000}
            className="field"
          />
        </label>
        <label className="grid gap-1 font-medium">
          Location
          <input
            name="location"
            defaultValue={entry?.location ?? ""}
            maxLength={2000}
            className="field"
          />
        </label>
        <label className="grid gap-1 font-medium">
          Start date{" "}
          <span className="text-sm font-normal text-[var(--muted)]">
            YYYY, YYYY-MM, or YYYY-MM-DD
          </span>
          <input
            name="startDate"
            defaultValue={inputDate(entry, "start")}
            inputMode="numeric"
            className="field"
          />
        </label>
        <label className="grid gap-1 font-medium">
          End date{" "}
          <span className="text-sm font-normal text-[var(--muted)]">
            Leave blank if current
          </span>
          <input
            name="endDate"
            defaultValue={inputDate(entry, "end")}
            inputMode="numeric"
            className="field"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          name="isCurrent"
          defaultChecked={entry?.is_current}
        />{" "}
        This is current
      </label>
      <label className="grid gap-1 font-medium">
        Description
        <textarea
          name="description"
          defaultValue={entry?.description ?? ""}
          rows={5}
          maxLength={20000}
          className="field"
        />
      </label>
      <label className="grid gap-1 font-medium">
        Tags{" "}
        <span className="text-sm font-normal text-[var(--muted)]">
          Comma-separated
        </span>
        <input
          name="tags"
          defaultValue={entry?.tags.join(", ") ?? ""}
          className="field"
        />
      </label>
      <button type="submit" className="button w-fit">
        {entry ? "Save entry" : "Create entry"}
      </button>
    </form>
  );
}
