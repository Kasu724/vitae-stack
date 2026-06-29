import { timestamp } from "drizzle-orm/pg-core";

export function mutableTimestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  };
}
