# Copilotz 🤖

An event-driven AI agent framework built with TypeScript/Deno. Create multi-agent systems with tool calling, streaming, and persistent conversation threads.

## Features

- 🔄 **Event-Driven Architecture** - Async event queue with NEW_MESSAGE, LLM_CALL, and TOOL_CALL processors
- 🤖 **Multi-Agent Support** - Coordinate multiple AI agents with agent-to-agent communication
- 🔌 **Multiple LLM Providers** - OpenAI, Anthropic, Gemini, Groq, Deepseek, Ollama
- 🛠️ **Built-in Tools** - File operations, command execution, thread/task management, agent questions
- 🌐 **API & MCP Integration** - Auto-generate tools from OpenAPI specs and MCP servers
- 💾 **Persistent Threads** - PostgreSQL/PGLite storage with message history
- 📡 **Streaming Support** - Real-time token streaming with callbacks
- 🎯 **Type-Safe** - Full TypeScript types with Drizzle ORM

## Installation

```bash
# Using Deno
deno add @copilotz/copilotz
```

## Quick Start

### Single Interaction

```typescript
import { run } from "@copilotz/copilotz";

const result = await run({
  initialMessage: {
    content: "Hello! What can you help me with?",
  },
  agents: [
    {
      id: "assistant-1",
      name: "Assistant",
      type: "agent",
      instructions: "You are a helpful assistant.",
      llmOptions: {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.7,
      },
    },
  ],
  dbConfig: { url: ":memory:" }, // or PostgreSQL URL
  stream: true,
  callbacks: {
    onContentStream: (data) => {
      if (!data.isComplete) {
        Deno.stdout.writeSync(new TextEncoder().encode(data.token));
      }
    },
  },
});

console.log(`Thread ID: ${result.threadId}`);
```

### Interactive CLI

```typescript
import { runCLI } from "@copilotz/copilotz";

await runCLI({
  agents: [
    {
      id: "bot-1",
      name: "Bot",
      type: "agent",
      instructions: "You are a helpful assistant.",
      llmOptions: {
        provider: "openai",
        model: "gpt-4o-mini",
      },
      allowedTools: ["read_file", "write_file", "run_command"],
    },
  ],
  dbConfig: { url: ":memory:" },
});
```

## Configuration

### Agent Configuration

```typescript
interface Agent {
  id: string;
  name: string;
  type: "agent" | "user" | "tool" | "system";
  instructions?: string;
  description?: string;
  personality?: string;
  allowedAgents?: string[]; // Which agents this agent can communicate with
  allowedTools?: string[]; // Which tools this agent can use
  llmOptions: {
    provider: "openai" | "anthropic" | "gemini" | "groq" | "deepseek" | "ollama";
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string; // Falls back to env vars
  };
}
```

### Database Configuration

```typescript
interface DatabaseConfig {
  url?: string; // ":memory:" | "file:./db.db" | "postgresql://..."
  syncUrl?: string; // Optional sync URL for PGLite
  pgliteExtensions?: string[];
}
```

## Native Tools

Copilotz includes powerful built-in tools:

- **File Operations**: `read_file`, `write_file`, `list_directory`, `search_files`
- **System**: `run_command`, `wait`, `get_current_time`
- **Agent Communication**: `ask_question`, `create_thread`, `end_thread`
- **Task Management**: `create_task`
- **Web**: `fetch_text`, `http_request`
- **Knowledge**: `knowledge_search` (vector search)

Enable tools per agent:

```typescript
const agent = {
  // ...
  allowedTools: ["read_file", "write_file", "run_command", "ask_question"],
};
```

## Custom Tools

Define custom tools:

```typescript
const customTool = {
  key: "my_tool",
  name: "My Tool",
  description: "Does something useful",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string", description: "Input parameter" },
    },
    required: ["input"],
  },
  execute: async (params, context) => {
    return { result: `Processed: ${params.input}` };
  },
};

await run({
  // ...
  tools: [customTool],
});
```

## API Integration

Auto-generate tools from OpenAPI specs:

```typescript
await run({
  // ...
  apis: [
    {
      name: "My API",
      baseUrl: "https://api.example.com",
      openApiSchema: { /* OpenAPI 3.0 spec */ },
      headers: { "Authorization": "Bearer token" },
    },
  ],
});
```

## MCP Servers

Connect to Model Context Protocol servers:

```typescript
await run({
  // ...
  mcpServers: [
    {
      name: "filesystem",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      },
    },
  ],
});
```

## Multi-Agent Communication

Agents can communicate with each other:

```typescript
const agents = [
  {
    id: "researcher",
    name: "Researcher",
    instructions: "Research topics thoroughly",
    allowedTools: ["fetch_text", "ask_question"],
    allowedAgents: ["Writer"], // Can communicate with Writer
    // ...
  },
  {
    id: "writer",
    name: "Writer",
    instructions: "Write clear articles",
    allowedTools: ["write_file"],
    // ...
  },
];

// Researcher can ask Writer questions using ask_question tool
// Or use @mentions in messages: "Hey @Writer, can you help?"
```

## Event System

Copilotz uses an event queue with three core processors:

1. **NEW_MESSAGE** - Handles incoming messages, routes to agents
2. **LLM_CALL** - Executes LLM requests with streaming
3. **TOOL_CALL** - Validates and executes tool calls

Customize behavior with callbacks:

```typescript
await run({
  // ...
  callbacks: {
    onContentStream: (data) => {
      console.log(`[${data.agentName}] ${data.token}`);
    },
    onEvent: async (event) => {
      console.log(`Event: ${event.type}`, event.payload);
      // Optionally return custom events
      return { producedEvents: [/* custom events */] };
    },
  },
});
```

## Thread Management

Threads maintain conversation context:

```typescript
// Create a new thread
const { threadId } = await run({
  initialMessage: {
    content: "Start conversation",
    threadName: "My Thread",
    participants: ["Agent1", "Agent2"],
  },
  // ...
});

// Continue existing thread
await run({
  initialMessage: {
    content: "Follow-up message",
    threadId: threadId, // Reuse thread
  },
  // ...
});

// Use external IDs for stable references
await run({
  initialMessage: {
    threadExternalId: "user-session-123",
    content: "Message",
  },
  // ...
});
```

## Environment Variables

```bash
# LLM Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...

# Database
DATABASE_URL=postgresql://...
SYNC_DATABASE_URL=postgresql://... # Optional PGLite sync

# Debug
COPILOTZ_DB_DEBUG=1
```

## Architecture

```
┌─────────────┐
│   run()     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Event Queue │
└──────┬──────┘
       │
       ├──► NEW_MESSAGE Processor ──► Route to agents
       │
       ├──► LLM_CALL Processor ──► Call LLM with streaming
       │
       └──► TOOL_CALL Processor ──► Execute tools
                                    └──► Native / API / MCP
```

## Testing

```bash
# Run unit tests
deno test --allow-env --allow-net --allow-read

# Manual CLI test
deno run --allow-env --allow-net --allow-read manual-cli-test.ts
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ using [Deno](https://deno.com) and [Drizzle ORM](https://orm.drizzle.team)

