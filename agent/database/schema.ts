import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
} from "npm:drizzle-orm@0.44.4/pg-core";

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  role: text("role").notNull(),
  personality: text("personality"),
  instructions: text("instructions"),
  description: text("description"),
  capabilities: jsonb("capabilities").$type<string[]>(),
  tools: jsonb("tools").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tools = pgTable("tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  inputSchema: jsonb("input_schema").$type<object>(),
  outputSchema: jsonb("output_schema").$type<object>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  goal: text("goal").notNull(),
  successCriteria: text("success_criteria"),
  status: varchar("status", {
    enum: ["pending", "in_progress", "completed", "failed"],
  })
    .default("pending")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id),
  senderId: text("sender_id").notNull(),
  senderType: varchar("sender_type", { enum: ["agent", "user", "system", "tool"] })
    .notNull(),
  content: text("content"),
  toolCallId: varchar("tool_call_id", { length: 255 }),
  toolCalls: jsonb("tool_calls").$type<object[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tool_logs = pgTable("tool_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id),
  taskId: uuid("task_id").references(() => tasks.id),
  agentId: uuid("agent_id").references(() => agents.id),
  toolName: varchar("tool_name", { length: 255 }).notNull(),
  toolInput: jsonb("tool_input"),
  toolOutput: jsonb("tool_output"),
  status: varchar("status", { enum: ["success", "error"] }).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const queue = pgTable("queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id),
  message: jsonb("message").notNull().$type<object>(),
  status: varchar("status", {
    enum: ["pending", "processing", "completed", "failed"],
  })
    .default("pending")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schema = {
  agents,
  tools,
  threads,
  tasks,
  messages,
  tool_logs,
  queue,
};

export const schemaDDL: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  `CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" text NOT NULL,
	"personality" text,
	"instructions" text,
	"capabilities" jsonb,
	"tools" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "tools" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tools_name_unique" UNIQUE("name"),
	CONSTRAINT "tools_key_unique" UNIQUE("key")
);`,
  `CREATE TABLE IF NOT EXISTS "threads" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"participants" jsonb,
	"initial_message" text,
	"mode" varchar DEFAULT 'immediate' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"summary" text,
	"parent_thread_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"goal" text NOT NULL,
	"success_criteria" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"sender_type" varchar NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_call_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "tool_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"thread_id" uuid NOT NULL,
	"task_id" uuid,
	"agent_id" uuid,
	"tool_name" varchar(255) NOT NULL,
	"tool_input" jsonb,
	"tool_output" jsonb,
	"status" varchar NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "queue" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message" jsonb NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);`,
  `DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
  `DO $$ BEGIN
 ALTER TABLE "tool_logs" ADD CONSTRAINT "tool_logs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
  `DO $$ BEGIN
 ALTER TABLE "tool_logs" ADD CONSTRAINT "tool_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
  `DO $$ BEGIN
 ALTER TABLE "tool_logs" ADD CONSTRAINT "tool_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
  `DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
]; 