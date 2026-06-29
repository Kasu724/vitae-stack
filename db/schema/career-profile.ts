import { integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { mutableTimestamps } from "./common";
import { workspaces } from "./identity";

export const careerProfiles = pgTable(
  "career_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    headline: text("headline"),
    revision: integer("revision").default(1).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex("career_profiles_workspace_unique").on(table.workspaceId),
    uniqueIndex("career_profiles_id_workspace_unique").on(
      table.id,
      table.workspaceId,
    ),
  ],
);
