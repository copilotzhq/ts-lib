import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";

export interface ToolParameters {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
}

export const tools: any = pgTable("tools", {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").$type<ToolParameters>(),
    outputSchema: jsonb("output_schema").$type<object>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;