import { pgTable, uuid, varchar, jsonb, integer, timestamp } from "@/database/drizzle.ts";
import type { MessagePayload, ToolCallPayload, LLMCallPayload, ToolResultPayload, LLMResultPayload } from "@/interfaces/index.ts";

type EventType =
  | "NEW_MESSAGE"
  | "TOOL_CALL"
  | "LLM_CALL"
  | string;

export const queue: any = pgTable("queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull().$type<EventType>(),
  payload: jsonb("payload").notNull().$type<MessagePayload | ToolCallPayload | ToolResultPayload | LLMCallPayload | LLMResultPayload>(),
  parentEventId: uuid("parent_event_id"),
  traceId: varchar("trace_id", { length: 255 }),
  priority: integer("priority"),
  status: varchar("status", { enum: ["pending", "processing", "completed", "failed"] }).default("pending").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Queue = typeof queue.$inferSelect;
export type NewQueue = typeof queue.$inferInsert;

// Event types for the new event-driven queue engine
export type Event = Omit<Queue, "eventType"> & { type: EventType }
export type NewEvent = Omit<NewQueue, "eventType"> & { type: EventType }



