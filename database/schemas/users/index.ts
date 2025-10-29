import { pgTable, uuid, varchar, jsonb, timestamp } from "../../drizzle.ts";
// Users table
export const users: any = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 255 }),
    externalId: varchar("external_id", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  });
  
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;