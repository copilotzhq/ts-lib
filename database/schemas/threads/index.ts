import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";
export const threads: any = pgTable("threads", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    description: text("description"),
    participants: jsonb("participants").$type<string[]>(),
    initialMessage: text("initial_message"),
    mode: varchar("mode", { enum: ["background", "immediate"] })
      .default("immediate")
      .notNull(),
    status: varchar("status", { enum: ["active", "inactive", "archived"] })
      .default("active")
      .notNull(),
    summary: text("summary"),
    parentThreadId: uuid("parent_thread_id"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;