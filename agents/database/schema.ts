import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
  integer
} from "drizzle-orm/pg-core";

import type { ProviderConfig } from "../../ai/llm/types.ts";

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

export const tools:any = pgTable("tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  externalId: varchar("external_id", { length: 255 }),
  description: text("description").notNull(),
  inputSchema: jsonb("input_schema").$type<object>(),
  outputSchema: jsonb("output_schema").$type<object>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apis:any = pgTable("apis", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  externalId: varchar("external_id", { length: 255 }),
  description: text("description"),
  openApiSchema: jsonb("open_api_schema").$type<object>(),
  baseUrl: text("base_url"),
  headers: jsonb("headers").$type<Record<string, string>>(),
  auth: jsonb("auth").$type<AuthConfig>(),
  timeout: integer("timeout"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mcpServers:any = pgTable("mcp_servers", {
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

export const threads:any = pgTable("threads", {
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

export const tasks:any = pgTable("tasks", {
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

export const messages:any = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id),
  senderUserId: uuid("sender_user_id").references(() => users.id),
  senderId: text("sender_id").notNull(),
  senderType: varchar("sender_type", { enum: ["agent", "user", "system", "tool"] })
    .notNull(),
  externalId: varchar("external_id", { length: 255 }),
  content: text("content"),
  toolCallId: varchar("tool_call_id", { length: 255 }),
  toolCalls: jsonb("tool_calls").$type<object[]>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tool_logs:any = pgTable("tool_logs", {
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
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const queue:any = pgTable("queue", {
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
  metadata: jsonb("metadata").$type<Record<string, any>>(),
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
  apis,
  mcpServers,
  users,
};


// Authentication configuration types
interface ApiKeyAuth {
  type: 'apiKey';
  key: string; // The API key value
  name: string; // Parameter name (e.g., 'X-API-Key', 'api_key')
  in: 'header' | 'query'; // Where to put the API key
}

interface BearerAuth {
  type: 'bearer';
  token: string; // The bearer token (JWT, OAuth token, etc.)
  scheme?: string; // Optional scheme (default: 'Bearer')
}

interface BasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

interface CustomAuth {
  type: 'custom';
  headers?: Record<string, string>; // Custom headers
  queryParams?: Record<string, string>; // Custom query parameters
}

interface DynamicAuth {
  type: 'dynamic';
  authEndpoint: {
      url: string; // Auth endpoint URL (e.g., '/auth/login', '/oauth/token')
      method?: 'GET' | 'POST' | 'PUT'; // HTTP method (default: POST)
      headers?: Record<string, string>; // Headers for auth request
      body?: any; // Auth request body (credentials, client_id, etc.)
      credentials?: {
          username?: string;
          password?: string;
          client_id?: string;
          client_secret?: string;
          grant_type?: string;
          [key: string]: any; // Additional auth parameters
      };
  };
  tokenExtraction: {
      path: string; // JSONPath to extract token (e.g., 'access_token', 'data.token', 'response.authKey')
      type: 'bearer' | 'apiKey'; // How to use the extracted token
      headerName?: string; // For apiKey type: where to put the token (default: 'Authorization')
      prefix?: string; // Token prefix (e.g., 'Bearer ', 'Token ', default: 'Bearer ' for bearer type)
  };
  refreshConfig?: {
      refreshPath?: string; // JSONPath to refresh token (e.g., 'refresh_token')
      refreshEndpoint?: string; // Endpoint for token refresh
      refreshBeforeExpiry?: number; // Refresh N seconds before expiry (default: 300)
      expiryPath?: string; // JSONPath to token expiry (e.g., 'expires_in', 'exp')
  };
  cache?: {
      enabled?: boolean; // Whether to cache tokens (default: true)
      duration?: number; // Cache duration in seconds (default: 3600)
  };
}

type AuthConfig = ApiKeyAuth | BearerAuth | BasicAuth | CustomAuth | DynamicAuth;

export const schemaDDL: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  `CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"role" text NOT NULL,
	"personality" text,
	"instructions" text,
	"description" text,
	"agent_type" varchar DEFAULT 'agentic' NOT NULL,
	"allowed_agents" jsonb,
	"allowed_tools" jsonb,
	"llm_options" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "tools" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"description" text NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tools_name_unique" UNIQUE("name"),
	CONSTRAINT "tools_key_unique" UNIQUE("key")
);`,
  `CREATE TABLE IF NOT EXISTS "threads" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"description" text,
	"participants" jsonb,
	"initial_message" text,
	"mode" varchar DEFAULT 'immediate' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"summary" text,
	"parent_thread_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"goal" text NOT NULL,
	"success_criteria" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"sender_id" text NOT NULL,
	"sender_type" varchar NOT NULL,
	"external_id" varchar(255),
	"content" text,
	"tool_calls" jsonb,
	"tool_call_id" varchar(255),
	"metadata" jsonb,
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
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "queue" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message" jsonb NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "apis" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"description" text,
	"open_api_schema" jsonb,
	"base_url" text,
	"headers" jsonb,
	"auth" jsonb,
	"timeout" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"description" text,
	"transport" jsonb,
	"capabilities" jsonb,
	"env" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"external_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);`,
  `DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;`,
  `DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
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
END $$;`
]; 