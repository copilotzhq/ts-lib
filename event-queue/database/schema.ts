import { pgTable, uuid, varchar, jsonb, integer, timestamp } from "../../db/drizzle.ts";

export const queue = pgTable("queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull().$type<object>(),
  parentEventId: uuid("parent_event_id"),
  traceId: varchar("trace_id", { length: 255 }),
  priority: integer("priority"),
  status: varchar("status", { enum: ["pending", "processing", "completed", "failed"] }).default("pending").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const schema = { queue };

export const schemaDDL: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  `CREATE TABLE IF NOT EXISTS "queue" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    "thread_id" uuid NOT NULL,
    "event_type" varchar(64) NOT NULL,
    "payload" jsonb NOT NULL,
    "parent_event_id" uuid,
    "trace_id" varchar(255),
    "priority" integer,
    "status" varchar DEFAULT 'pending' NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  );`,
];


