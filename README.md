# COPILOTZ

[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](https://github.com/yourusername/copilotz)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Deno](https://img.shields.io/badge/deno-%5E2.0-black.svg)](https://deno.land/)

Event-driven multi-agent AI framework for building production-grade conversational systems with tool calling, streaming, and persistent state management.

## Overview

COPILOTZ is a TypeScript/Deno framework designed for developers building complex AI agent systems. It provides an event-driven architecture that handles message routing, LLM orchestration, tool execution, and conversation persistence through a PostgreSQL-backed queue system.

**Key Differentiators:**
- Event-driven processing with four core event types (NEW_MESSAGE, LLM_CALL, TOOL_CALL, TOKEN)
- Multi-agent coordination with fine-grained access control
- Native support for multiple LLM providers (OpenAI, Anthropic, Google, Groq, DeepSeek, Ollama)
- Built-in tool ecosystem: native tools, OpenAPI integration, and MCP protocol support
- PostgreSQL/PGLite-backed persistence with type-safe database operations
- Real-time streaming with configurable callbacks

## Architecture

```
                      ┌─────────────────────┐
                      │   Event Queue       │
                      │   (PostgreSQL)      │
                      └──────────┬──────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │  NEW_MESSAGE        │
           ┌────────▶ │  Processor          │◀───────────┐
           │          └─────────┬───────────┘            │
           │                    │Produces                │
           │        ┌───────────┴───────────┐            │
           │        │           │           │            │
           │        ▼           │           ▼            │
           │ ┌──────────────┐   │   ┌──────────────┐     │
           │ │  LLM_CALL    │   │   │  TOOL_CALL   │     │
           │ │  Processor   │   │   │  Processor   │     │
           │ └────────────┬─┘   │   └──────┬───────┘     │
           │              │     │          │             │
           │  Produces    │     │          │ Produces    │
           │  NEW_MESSAGE │     │          │ NEW_MESSAGE │
           │              │     │          │             │
           └──────────────┘     │          └─────────────┘ 
                                ▼
                       ┌──────────────────┐
                       │ End (no events)  │
                       └──────────────────┘

         During LLM_CALL:
         ┌────────────────────────────────────┐
         │ TOKEN Events (streaming)           │
         │ • Emitted for each response token  │
         │ • Listenable via callbacks         │
         │ • Read-only (non-overwritable)     │
         └────────────────────────────────────┘

Note: All events (NEW_MESSAGE, LLM_CALL, TOOL_CALL) are 
listenable and overwritable via callbacks in copilotz.run()
```

## Features

- **Multi-Agent Orchestration**: Define multiple agents with distinct roles, LLM configurations, and access permissions
- **Event-Driven Processing**: Asynchronous queue-based event handling with customizable callbacks
- **15 Native Tools**: File operations, system commands, HTTP requests, agent communication, task management
- **OpenAPI Integration**: Auto-generate tools from OpenAPI 3.0 specifications
- **MCP Protocol Support**: Connect to Model Context Protocol servers via stdio transport
- **Persistent Threads**: Database-backed conversation history with participant tracking
- **Real-Time Streaming**: Token-level streaming with configurable acknowledgment modes
- **Type-Safe Operations**: Full TypeScript types with database schema validation
- **Flexible Database**: PostgreSQL for production, PGLite for development/embedded use

## Installation

```bash
# Add to your deno.json imports
{
  "imports": {
    "@copilotz/copilotz": "jsr:@copilotz/copilotz@^0.7.0"
  }
}
```

### Prerequisites

- Deno 2.0 or higher
- PostgreSQL 13+ (optional; PGLite available for embedded use)
- LLM provider API keys (OpenAI, Anthropic, Google, Groq, DeepSeek, or Ollama)

### Environment Variables

```bash
# LLM Providers (configure as needed)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...

# Database (optional)
DATABASE_URL=postgresql://user:pass@host:port/dbname
SYNC_DATABASE_URL=postgresql://... # For PGLite sync

# Debug
COPILOTZ_DB_DEBUG=1
```

## Quick Start

### Basic Single Agent

```typescript
import { createCopilotz } from "@copilotz/copilotz";

const copilotz = await createCopilotz({
  agents: [{
    id: "assistant-1",
    name: "Assistant",
    role: "assistant",
    agentType: "agentic",
    instructions: "You are a helpful assistant with file system access.",
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.7,
    },
    allowedTools: ["read_file", "write_file", "list_directory"],
  }],
  dbConfig: { url: ":memory:" }, // Use in-memory PGLite
  stream: true,
});

// Single interaction
const result = await copilotz.run({
  content: "List files in the current directory",
  sender: { type: "user", name: "user" },
});

await copilotz.shutdown();
```

### Interactive CLI Mode

```typescript
const copilotz = await createCopilotz({
  agents: [/* ... */],
  dbConfig: { url: "file:./data/copilotz.db" },
  stream: true,
});

// Start interactive session
const controller = copilotz.start({
  content: "Hello! How can I help you today?",
  sender: { type: "user", name: "CLI" },
  thread: { externalId: "cli-session-1" },
  banner: "🤖 COPILOTZ v0.7.0\n",
  quitCommand: "quit",
});

// Session continues until user types "quit"
await controller.closed;
await copilotz.shutdown();
```

## Core Concepts

### Event Types

COPILOTZ processes four event types through its queue:

| Event Type | Purpose | Triggers |
|------------|---------|----------|
| `NEW_MESSAGE` | Routes incoming messages to appropriate agents | User input, agent responses, tool results |
| `LLM_CALL` | Executes LLM requests with context | Agent activation, conversation history |
| `TOOL_CALL` | Validates and executes tool calls | LLM-generated tool invocations |
| `TOKEN` | Streams response tokens in real-time | LLM streaming responses |

### Agents

Agents are autonomous entities with distinct capabilities:

```typescript
interface Agent {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  role: string;                  // The role of the agent
  instructions?: string;         // System prompt
  description?: string;          // Agent purpose (for other agents)
  personality?: string;          // Behavioral traits
  allowedAgents?: string[];      // Inter-agent communication whitelist
  allowedTools?: string[];       // Tool access whitelist
  llmOptions: {
    provider: "openai" | "anthropic" | "gemini" | "groq" | "deepseek" | "ollama";
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;             // Overrides environment variable
  };
}
```

### Threads

Threads represent persistent conversation contexts:

```typescript
// Create or continue thread
await copilotz.run({
  content: "Hello",
  sender: { type: "user", name: "user" },
  thread: {
    externalId: "user-session-123",  // Stable reference
    name: "Customer Support Chat",
    participants: ["Agent1", "Agent2"],
    metadata: { customerId: "cust-456" },
  },
});

// Access thread history via ops
const messages = await copilotz.ops.getMessagesForThread(threadId, {
  order: "asc",
  limit: 50,
});
```

### Tools

Three tool types integrate seamlessly:

#### Native Tools (Built-in)

```typescript
allowedTools: [
  "read_file", "write_file", "list_directory", "search_files",  // Filesystem
  "run_command", "wait", "get_current_time",                    // System
  "http_request", "fetch_text",                                 // HTTP
  "ask_question", "create_thread", "end_thread",                // Communication
  "create_task", "verbal_pause",                                // Task Management
]
```

### Media and Assets

COPILOTZ provides first‑class handling for media returned by tools or LLMs without stuffing raw base64 into history.

- Asset refs: Stable identifiers `asset://<id>` pointing to stored bytes.
- Default store: In‑memory `AssetStore` (no persistence). Provider adapters use data URLs generated on demand.
- Event: `ASSET_CREATED` is emitted (ephemeral) when media is stored. Payload includes `assetId`, `ref`, `mime` and convenience `base64`/`dataUrl` for clients.
- Helpers:
  - `copilotz.assets.getBase64(refOrId) → { base64, mime }`
  - `copilotz.assets.getDataUrl(refOrId) → string`

Configure:

```typescript
const copilotz = await createCopilotz({
  agents: [/* ... */],
  // Optional assets configuration
  assets: {
    config: {
      inlineThresholdBytes: 256_000, // default
      resolveInLLM: true,            // default: resolve asset:// to data URLs for LLMs
    },
    // store?: AssetStore // bring your own (filesystem, S3, etc.)
  },
});
```

Resolution behavior in LLM calls:

- resolveInLLM = true (default):
  - Attachments become provider‑specific parts.
  - Images/files → data URLs via `image_url`/`file`; audio → base64 in `input_audio`.
- resolveInLLM = false:
  - Multimodal parts are stripped; text remains (e.g., JSON with `assetRef`).
  - Let the model fetch on demand via a tool (see `fetch_asset` below) to save tokens.

Native media tools:

```typescript
// Save bytes to asset store; returns { assetRef, mimeType, size, kind }
// Allow this tool for agents that will create media
allowedTools: ["save_asset", "fetch_asset"];

// Fetch previously saved asset by ref/id
// Args:
//  - ref?: "asset://<id>" or id?: "<id>"
//  - format?: "dataUrl" | "base64" (default "dataUrl")
```

Listen for asset events:

```typescript
const handle = await copilotz.run(message);
for await (const ev of handle.events) {
  if (ev.type === "ASSET_CREATED") {
    const { assetId, ref, mime, base64, dataUrl } = (ev as any).payload;
    // client can display or persist as needed
  }
}
await handle.done;
```

### Asset Store

The Asset Store manages binary media referenced in conversations.

Interface:

```typescript
export interface AssetConfig {
  inlineThresholdBytes?: number; // default ~256k
  resolveInLLM?: boolean;        // default true (resolve to provider-acceptable formats)
  backend?: "memory" | "fs" | "s3"; // default "memory"
  fs?: { rootDir: string; baseUrl?: string; prefix?: string; connector?: FsConnector };
  s3?: { bucket: string; connector: S3Connector; publicBaseUrl?: string; keyPrefix?: string };
}

export interface AssetStore {
  save(bytes: Uint8Array, mime: string): Promise<{ assetId: string }>;
  get(assetId: string): Promise<{ bytes: Uint8Array; mime: string }>;
  urlFor(assetId: string, opts?: { inline?: boolean }): Promise<string>; // return data URL or external URL
  info?(assetId: string): Promise<{ id: string; mime: string; size: number; createdAt: Date } | undefined>;
}
```

Backends:
- **memory** (default): In-memory store, returns data URLs, does not persist across restarts.
- **fs**: Filesystem-backed store. Requires `fs.rootDir`. Optionally set `fs.baseUrl` for public URLs.
- **s3**: S3-compatible store. Requires `s3.bucket` and `s3.connector`. Optionally set `s3.publicBaseUrl` or use connector's signed URLs.

Defaults:
- When `resolveInLLM` is true, attachments resolve to provider-specific parts (image_url/file/input_audio).
- When `resolveInLLM` is false, only text is sent; the model can use `fetch_asset` to retrieve media on demand.

Configuration examples:

```typescript
// Memory (default)
const copilotz = await createCopilotz({
  agents: [/* ... */],
  assets: {
    config: {
      inlineThresholdBytes: 256_000,
      resolveInLLM: true,
    },
  },
});

// Filesystem backend
import { createFsConnector } from "@copilotz/copilotz/connectors/storage/fs";
const copilotz = await createCopilotz({
  agents: [/* ... */],
  assets: {
    config: {
      backend: "fs",
      fs: {
        rootDir: "./assets",
        baseUrl: "https://cdn.example.com/assets", // optional public URL
        prefix: "media", // optional subfolder
      },
    },
  },
});

// S3 backend
import { createS3Connector } from "@copilotz/copilotz/connectors/storage/s3";
const s3Connector = createS3Connector({
  baseUrl: "https://s3.amazonaws.com",
  // ... your S3 config (credentials, region, etc.)
});
const copilotz = await createCopilotz({
  agents: [/* ... */],
  assets: {
    config: {
      backend: "s3",
      s3: {
        bucket: "my-assets-bucket",
        connector: s3Connector,
        publicBaseUrl: "https://cdn.example.com", // optional
        keyPrefix: "copilotz", // optional key prefix
      },
    },
  },
});

// Or inject a custom store directly
const copilotz = await createCopilotz({
  agents: [/* ... */],
  assets: {
    store: myCustomAssetStore, // implements AssetStore interface
  },
});
```

Runtime usage:
- In tools/processors: `context.assetStore.save/get/urlFor`, and `context.resolveAsset(ref)` to obtain bytes+mime.
- From clients: `copilotz.assets.getBase64(refOrId)` and `copilotz.assets.getDataUrl(refOrId)`.

Custom store (sketch):

```typescript
function createFilesystemAssetStore(root: string): AssetStore {
  return {
    async save(bytes, mime) {
      const id = crypto.randomUUID();
      await Deno.writeFile(`${root}/${id}`, bytes);
      return { assetId: id };
    },
    async get(id) {
      const bytes = await Deno.readFile(`${root}/${id}`);
      // determine mime from sidecar/extension, omitted for brevity
      return { bytes, mime: "application/octet-stream" };
    },
    async urlFor(id) {
      // return signed/public URL if available; fallback to data URL
      const { bytes, mime } = await this.get(id);
      const b64 = btoa(String.fromCharCode(...bytes));
      return `data:${mime};base64,${b64}`;
    },
  };
}
```

#### Custom Tools

```typescript
const customTool = {
  key: "database_query",
  name: "Database Query",
  description: "Execute SQL queries against the application database",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SQL query to execute" },
    },
    required: ["query"],
  },
  execute: async (params, context) => {
    // Implementation with access to context.db, context.thread, etc.
    const result = await db.query(params.query);
    return { rows: result.rows, count: result.rows.length };
  },
};

await copilotz.run(
  { content: "Query the users table" },
  undefined,
  { tools: [customTool] }
);
```

#### API Tools (OpenAPI)

```typescript
const api = {
  id: "crm-api",
  name: "CRM API",
  description: "Customer relationship management system",
  baseUrl: "https://api.crm.example.com",
  openApiSchema: {
    openapi: "3.0.0",
    paths: {
      "/customers/{id}": {
        get: {
          operationId: "getCustomer",
          parameters: [{ name: "id", in: "path", required: true }],
          // ...
        },
      },
    },
  },
  headers: {
    "Authorization": "Bearer token",
  },
};

await copilotz.run(
  { content: "Get customer details for ID 12345" },
  undefined,
  { apis: [api] }
);
```

#### MCP Servers

```typescript
const mcpServer = {
  id: "mcp-filesystem",
  name: "filesystem",
  description: "Access local filesystem via MCP",
  transport: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
  },
};

await copilotz.run(
  { content: "List the workspace directory" },
  undefined,
  { mcpServers: [mcpServer] }
);
```

## Database Operations

The `copilotz.ops` API provides high-level operations and raw CRUD access:

### High-Level Operations

```typescript
// User management
const user = await copilotz.ops.getUserByExternalId("customer-42");
const userById = await copilotz.ops.getUserById("uuid");

// Thread operations
const thread = await copilotz.ops.getThreadByExternalId("session-123");
const threads = await copilotz.ops.getThreadsForParticipant(userId, {
  order: "desc",
  limit: 10,
});

// Message operations
const messages = await copilotz.ops.getMessagesForThread(threadId, {
  order: "asc",
  offset: 0,
  limit: 50,
});

// Task management
const tasks = await copilotz.ops.getTasksForThread(threadId);
const task = await copilotz.ops.getTaskById(taskId);

// Queue operations
const queueItem = await copilotz.ops.addToQueue(threadId, {
  eventType: "NEW_MESSAGE",
  payload: messagePayload,
  ttlMs: 60000,
});
```

### Low-Level CRUD Operations

The `ops.crud` interface provides direct access to all database tables:

```typescript
// Access any table with full CRUD operations
const { crud } = copilotz.ops;

// Users
await crud.users.create({ name: "John", email: "john@example.com" });
await crud.users.findOne({ email: "john@example.com" });
await crud.users.findMany({ status: "active" }, { limit: 10 });
await crud.users.update({ id: userId }, { name: "John Doe" });
await crud.users.deleteMany({ status: "inactive" });

// Threads
await crud.threads.create({ name: "New Thread", participants: ["Agent1"] });
await crud.threads.findOne({ externalId: "session-123" });

// Messages
await crud.messages.findMany({ threadId }, { order: "createdAt", limit: 50 });
await crud.messages.count({ threadId, sender: { type: "user" } });

// Agents
await crud.agents.create(agentConfig);
await crud.agents.update({ id: agentId }, { instructions: "New prompt" });

// Tools, APIs, MCP Servers
await crud.tools.findMany({ type: "native" });
await crud.apis.findOne({ id: apiId });
await crud.mcpServers.findMany({});

// Events and Queue
await crud.events.findMany({ threadId, type: "LLM_CALL" });
await crud.queue.deleteMany({ status: "completed", threadId });

// Tasks
await crud.tasks.findMany({ status: "pending", assignedTo: agentId });
```

**Available CRUD methods for all tables:**
- `create(data)` - Insert single record
- `createMany(dataArray)` - Batch insert
- `findOne(where)` - Find single record
- `findMany(where, options)` - Query with filtering
- `update(where, data)` - Update records
- `deleteMany(where)` - Delete records
- `count(where)` - Count records

**Available tables:**
`users`, `agents`, `threads`, `messages`, `tools`, `apis`, `mcpServers`, `queue`, `events`, `tasks`

## Advanced Usage

### Multi-Agent Collaboration

```typescript
const copilotz = await createCopilotz({
  agents: [
    {
      id: "coordinator",
      name: "Coordinator",
      role: "assistant",
      agentType: "agentic",
      instructions: "Delegate tasks to specialized agents",
      allowedAgents: ["Researcher", "Writer"],
      allowedTools: ["ask_question", "create_task"],
      llmOptions: { provider: "openai", model: "gpt-4o" },
    },
    {
      id: "researcher",
      name: "Researcher",
      role: "assistant",
      agentType: "reactive",
      instructions: "Research topics thoroughly using web search",
      allowedTools: ["fetch_text", "search_files"],
      llmOptions: { provider: "openai", model: "gpt-4o-mini" },
    },
    {
      id: "writer",
      name: "Writer",
      role: "assistant",
      agentType: "reactive",
      instructions: "Write clear, engaging content",
      allowedTools: ["write_file"],
      llmOptions: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    },
  ],
  dbConfig: { url: "postgresql://localhost/copilotz" },
});
```

### Event Callbacks and Streaming

```typescript
await copilotz.run(
  {
    content: "Generate a report",
    sender: { type: "user", name: "user" },
  },
  async (event) => {
    // Handle all event types
    switch (event.type) {
      case "NEW_MESSAGE":
        console.log(`Message: ${event.payload.content}`);
        break;
      case "LLM_CALL":
        console.log(`LLM: ${event.payload.provider}/${event.payload.model}`);
        break;
      case "TOOL_CALL":
        console.log(`Tool: ${event.payload.toolName}(${JSON.stringify(event.payload.args)})`);
        break;
      case "TOKEN":
        // Stream tokens to client
        process.stdout.write(event.payload.token);
        break;
    }
    
    // Optionally inject custom events
    return {
      producedEvents: [
        { type: "CUSTOM", payload: { /* ... */ } }
      ],
    };
  },
  {
    stream: true,
    ackMode: "onComplete", // Wait for full processing
    queueTTL: 300000,      // 5-minute timeout
  }
);
```

### Thread and Task Management

```typescript
// Create thread with specific participants
const result = await copilotz.run({
  content: "Start a new research project",
  sender: { type: "user", name: "user" },
  thread: {
    externalId: "project-alpha",
    name: "Project Alpha Research",
    participants: ["Coordinator", "Researcher"],
    metadata: { projectId: "alpha-001", priority: "high" },
  },
});

// Access tasks created during conversation
const tasks = await copilotz.ops.getTasksForThread(result.threadId);
for (const task of tasks) {
  console.log(`Task: ${task.title} (${task.status})`);
}
```

### Custom Database Configuration

```typescript
// PostgreSQL with connection pooling
const copilotz = await createCopilotz({
  agents: [/* ... */],
  dbConfig: {
    url: "postgresql://user:pass@localhost:5432/copilotz",
    syncUrl: "postgresql://user:pass@sync.example.com:5432/copilotz_sync",
  },
});

// Or use PGLite with extensions
const copilotz = await createCopilotz({
  agents: [/* ... */],
  dbConfig: {
    url: "file:./data/copilotz.db",
    pgliteExtensions: ["vector"], // For future RAG support
  },
});

// Bring your own database instance
const db = await createDatabase({ url: "..." });
const copilotz = await createCopilotz({
  agents: [/* ... */],
  dbInstance: db, // Framework won't manage lifecycle
});
```

## API Reference

### `createCopilotz(config: CopilotzConfig): Promise<Copilotz>`

Creates and initializes a COPILOTZ instance.

**Config:**
```typescript
interface CopilotzConfig {
  agents: AgentConfig[];           // Required: at least one agent
  tools?: ToolConfig[];            // Optional custom tools
  apis?: APIConfig[];              // Optional OpenAPI specs
  mcpServers?: MCPServerConfig[];  // Optional MCP servers
  callbacks?: ChatCallbacks;       // Global callbacks
  dbConfig?: DatabaseConfig;       // Database configuration
  dbInstance?: CopilotzDb;         // Pre-existing database instance
  threadMetadata?: Record<string, unknown>; // Default thread metadata
  queueTTL?: number;               // Default queue item TTL (ms)
  stream?: boolean;                // Enable streaming by default
  activeTaskId?: string;           // Current active task context
}
```

### `copilotz.run(message, onEvent?, options?): Promise<RunHandle>`

Execute a single message interaction.

**Returns:**
```typescript
interface RunHandle {
  queueId: string;                 // Queue item ID
  threadId: string;                // Thread ID
  status: "queued";
  events: AsyncIterable<Event>;    // Event stream
  done: Promise<void>;             // Completion promise
  cancel: () => void;              // Abort processing
}
```

### `copilotz.start(initialMessage?, onEvent?): CopilotzCliController`

Start interactive CLI mode.

**Returns:**
```typescript
interface CopilotzCliController {
  stop: () => void;                // Stop accepting input
  closed: Promise<void>;           // Session completion promise
}
```

### `copilotz.ops`

Database operations interface (see [Database Operations](#database-operations) section).

### `copilotz.shutdown(): Promise<void>`

Gracefully shutdown and cleanup resources.

## Native Tools Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `read_file` | Read file contents | `path: string` |
| `write_file` | Write file to disk | `path: string, content: string` |
| `list_directory` | List directory contents | `path: string` |
| `search_files` | Search files by pattern | `pattern: string, path?: string` |
| `run_command` | Execute shell command | `command: string, args?: string[]` |
| `http_request` | Make HTTP request | `url: string, method: string, body?: any` |
| `fetch_text` | Fetch URL as text | `url: string` |
| `ask_question` | Ask another agent | `question: string, agent: string` |
| `create_thread` | Create new thread | `name: string, participants: string[]` |
| `end_thread` | End current thread | `threadId?: string` |
| `create_task` | Create task | `title: string, description?: string` |
| `get_current_time` | Get current timestamp | (no parameters) |
| `wait` | Delay execution | `ms: number` |
| `verbal_pause` | Thinking indicator | `duration?: number` |

## Project Structure

```
/Users/vfssantos/Documents/Projetos/COPILOTZ/app/lib/
├── cli/                          # CLI utilities and banner
├── connectors/
│   ├── llm/                      # LLM provider implementations
│   │   └── providers/            # OpenAI, Anthropic, Google, etc.
│   └── request/                  # HTTP request utilities
├── database/
│   ├── migrations/               # Database schema migrations
│   ├── operations/               # High-level database operations
│   └── schemas/                  # TypeScript schema definitions
├── event-processors/             # Core event processing logic
│   ├── new_message/              # Message routing and context generation
│   ├── llm_call/                 # LLM execution and streaming
│   └── tool_call/                # Tool validation and execution
│       ├── generators/           # API and MCP tool generators
│       └── native-tools-registry/ # Built-in tools
├── runtime/                      # Thread runner and lifecycle
├── utils/                        # Shared utilities
├── interfaces/                   # TypeScript type definitions
└── index.ts                      # Main entry point
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed upcoming features:

- **Cross-Runtime Compatibility**: Node.js and Bun support
- **RAG (Retrieval-Augmented Generation)**: Document ingestion, embeddings, vector search
- **MCP Streaming Transport**: HTTP/WebSocket transport for MCP servers
- **API Tool Response Controls**: Fine-grained response formatting

## Troubleshooting

### Database Connection Issues

```bash
# Enable debug logging
export COPILOTZ_DB_DEBUG=1

# Verify PostgreSQL connection
psql $DATABASE_URL -c "SELECT version();"

# Use in-memory database for testing
dbConfig: { url: ":memory:" }
```

### LLM Provider Errors

```typescript
// Override API key per agent
llmOptions: {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "sk-...", // Takes precedence over env var
}

// Check environment variables
console.log(Deno.env.get("OPENAI_API_KEY"));
```

### Tool Execution Failures

```typescript
// Check tool permissions
allowedTools: ["read_file", "write_file"] // Must explicitly allow

// Verify tool is available
import { getNativeTools } from "@copilotz/copilotz";
console.log(Object.keys(getNativeTools()));
```

## Documentation

For detailed documentation, see the `/docs` directory:

- [Beginner's Guide](./docs/beginners-guide.md) - Introduction for newcomers
- [Agent Configuration](./docs/agents.md) - Detailed agent setup
- [Tool Development](./docs/tools.md) - Creating custom tools
- [Event System](./docs/events.md) - Event processing architecture
- [Database Schema](./docs/database.md) - Schema reference and migrations
- [API Integration](./docs/apis.md) - OpenAPI tool generation
- [MCP Integration](./docs/mcp.md) - Model Context Protocol setup

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome. Please ensure:
- Code follows existing style conventions
- All tests pass
- Documentation is updated for new features

---

**Built with:**
- [Deno](https://deno.land/) - TypeScript runtime
- [OmniPG](https://jsr.io/@oxian/ominipg) - Type-safe PostgreSQL client
- [PGLite](https://pglite.dev/) - Embedded PostgreSQL (WASM)
- [AJV](https://ajv.js.org/) - JSON schema validation
- [MCP SDK](https://modelcontextprotocol.io/) - Model Context Protocol

**Version:** 0.7.0 | **Last Updated:** November 2025

