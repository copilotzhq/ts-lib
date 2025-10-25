import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";
export const tasks: any = pgTable("tasks", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    goal: text("goal").notNull(),
    successCriteria: text("success_criteria"),
    status: varchar("status", {
      enum: ["pending", "in_progress", "completed", "failed"],
    })
      .default("pending")
      .notNull(),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;