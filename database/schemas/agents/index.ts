import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";
import type { ProviderConfig } from "@/connectors/llm/types.ts";

export const agents: any = pgTable("agents", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    role: text("role").notNull(),
    personality: text("personality"),
    instructions: text("instructions"),
    description: text("description"),
    agentType: varchar("agent_type", { enum: ["agentic", "programmatic"] }).default("agentic").notNull(),
    allowedAgents: jsonb("allowed_agents").$type<string[]>(),
    allowedTools: jsonb("allowed_tools").$type<string[]>(),
    llmOptions: jsonb("llm_options").$type<ProviderConfig>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
