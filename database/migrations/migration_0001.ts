export const generateMigrations = (): string => (`-- Migration 0001 - Initial Schema

-- This migration creates the initial schema for the database.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Agents Table
CREATE TABLE IF NOT EXISTS "agents" (
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
);

-- Create Tools Table
CREATE TABLE IF NOT EXISTS "tools" (
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
);

-- Create Threads Table
CREATE TABLE IF NOT EXISTS "threads" (
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
);


-- Create Tasks Table
CREATE TABLE IF NOT EXISTS "tasks" (
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
);

-- Create Messages Table
CREATE TABLE IF NOT EXISTS "messages" (
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);


-- Create MCP Servers Table
CREATE TABLE IF NOT EXISTS "mcp_servers" (
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
);


-- Create Users Table
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"external_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);


-- Create APIs Table
CREATE TABLE IF NOT EXISTS "apis" (
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
);

-- Create Queue Table
CREATE TABLE IF NOT EXISTS "queue" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
    "thread_id" uuid NOT NULL,
    "event_type" varchar(64) NOT NULL,
    "payload" jsonb NOT NULL,
    "parent_event_id" uuid,
    "trace_id" varchar(255),
    "priority" integer,
    "ttl_ms" integer,
    "expires_at" timestamp,
    "status" varchar DEFAULT 'pending' NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Alter Table Statements

-- Add columns to queue table
ALTER TABLE "queue"
  ADD COLUMN IF NOT EXISTS "ttl_ms" integer,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

-- Add Foreign Key Constraints
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE no action ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

-- Indexes to optimize common queries
-- Threads
CREATE INDEX IF NOT EXISTS "idx_threads_external_id_active" ON "threads" ("external_id") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "idx_threads_participants_gin" ON "threads" USING GIN ("participants");

-- Messages
CREATE INDEX IF NOT EXISTS "idx_messages_thread_id_created_at" ON "messages" ("thread_id", "created_at");

-- Queue
CREATE INDEX IF NOT EXISTS "idx_queue_thread_status" ON "queue" ("thread_id", "status");
CREATE INDEX IF NOT EXISTS "idx_queue_pending_order" ON "queue" ("thread_id", (COALESCE("priority", 0)) DESC, "created_at" ASC, "id" ASC) WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "idx_queue_status_expires_at" ON "queue" ("status", "expires_at");

-- Agents
CREATE INDEX IF NOT EXISTS "idx_agents_name" ON "agents" ("name");
CREATE INDEX IF NOT EXISTS "idx_agents_external_id" ON "agents" ("external_id");

-- APIs
CREATE INDEX IF NOT EXISTS "idx_apis_name" ON "apis" ("name");
CREATE INDEX IF NOT EXISTS "idx_apis_external_id" ON "apis" ("external_id");

-- Tools
CREATE INDEX IF NOT EXISTS "idx_tools_external_id" ON "tools" ("external_id");

-- Users
CREATE INDEX IF NOT EXISTS "idx_users_external_id" ON "users" ("external_id");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");

-- Update status enum if needed (e.g., add expired/overwritten) – PostgreSQL uses domain, so a simple check:
-- ALTER TABLE "queue" ALTER COLUMN "status" DROP DEFAULT;
-- ALTER TABLE "queue" ALTER COLUMN "status" TYPE varchar USING "status"::varchar;
-- ALTER TABLE "queue" ALTER COLUMN "status" SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS "idx_queue_thread_status"
  ON "queue" ("thread_id", "status");

CREATE INDEX IF NOT EXISTS "idx_queue_pending_order"
  ON "queue" (
    "thread_id",
    (COALESCE("priority", 0)) DESC,
    "created_at" ASC,
    "id" ASC
  )
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "idx_queue_status_expires_at"
  ON "queue" ("status", "expires_at");

`);