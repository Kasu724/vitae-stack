import { z } from "zod";

const selectedIdsSchema = z.array(z.string().uuid()).min(1).max(500);

export function selectedIds(form: FormData): string[] {
  const raw = form.getAll("selectedId");
  const parsed = selectedIdsSchema.parse(raw);
  return [...new Set(parsed)];
}

export function archivedValue(form: FormData): boolean {
  const value = form.get("archived");
  if (value !== "true" && value !== "false")
    throw new Error("The requested status action is invalid.");
  return value === "true";
}

export function safeReturnPath(
  form: FormData,
  routePrefix: string,
  fallback: string,
): string {
  const value = form.get("returnPath");
  if (
    typeof value !== "string" ||
    (!value.startsWith(`${routePrefix}?`) && value !== routePrefix) ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\r") ||
    value.includes("\n")
  )
    return fallback;
  return value;
}

export function withNotice(path: string, notice: string): string {
  const [pathname, query = ""] = path.split("?", 2);
  const parameters = new URLSearchParams(query);
  parameters.set("notice", notice);
  return `${pathname}?${parameters.toString()}`;
}
