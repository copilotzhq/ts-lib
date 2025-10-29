import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";


export const mcpServers: any = pgTable("mcp_servers", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    description: text("description"),
    transport: jsonb("transport").$type<{
        type: "stdio" | "sse" | "websocket";
        command?: string; // For stdio transport
        args?: string[]; // For stdio transport
        url?: string; // For sse/websocket transport
    }>(),
    capabilities: jsonb("capabilities").$type<string[]>(),
    env: jsonb("env").$type<object>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MCPServer = typeof mcpServers.$inferSelect;
export type NewMCPServer = typeof mcpServers.$inferInsert;