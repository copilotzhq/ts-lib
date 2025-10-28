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
    "status" varchar DEFAULT 'pending' NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

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

`);