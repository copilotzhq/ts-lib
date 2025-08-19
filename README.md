# 🤖 Copilotz

> Build sophisticated AI systems with agents, unified AI providers, and knowledge processing

**Copilotz** is a comprehensive TypeScript/Deno framework for building AI-powered applications. It combines **multi-agent systems**, **unified AI provider access**, and **intelligent knowledge processing** into a single, powerful toolkit.

## ⚡ 30-Second Start

```typescript
import { run, getNativeTools } from "copilotz/agents";

const agent = {
  name: "assistant",
  role: "Helpful Assistant",
  instructions: "Help users with their questions and tasks",
  allowedTools: Object.keys(getNativeTools()),
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini"
  }
};

// Single message
await run({
  initialMessage: { content: "Hello! Write a small file for me." },
  agents: [agent]
});

// Interactive CLI
await runCli({ agents: [agent] });
```

## 🌟 What You Can Build

- **🏦 Financial Research Systems** - Multi-agent teams that research, analyze, and report on stocks
- **📝 Content Creation Pipelines** - Research → Write → Review → Publish workflows
- **🤝 Customer Support** - Intelligent routing and escalation between specialized agents
- **🔧 Development Workflows** - Code generation, review, testing, and deployment automation
- **📚 Knowledge Management** - Document ingestion, semantic search, and intelligent retrieval

## 🏗️ Architecture Overview

```
copilotz/
├── 🤖 agents/     # Multi-agent conversation framework
├── 🧠 ai/         # Unified AI providers (LLM, embedding, speech, images)
└── 📚 knowledge/  # Document processing and semantic search
```

Each module works independently or together:
- Use **agents** for complex multi-step AI workflows
- Use **ai** for direct access to 15+ AI providers
- Use **knowledge** for document processing and RAG

## 📦 Modules

### 🤖 Agents
Multi-agent conversation framework with persistent threads, tool execution, and event-driven processing.

```typescript
import { createThread, runCli } from "copilotz/agents";

// Two agents collaborating
await createThread(
  { 
    content: "@Researcher find info about TypeScript, then @Writer create a blog post",
    participants: ["Researcher", "Writer"]
  },
  { agents: [researcherAgent, writerAgent] }
);
```

**Key Features:**
- **Multi-agent conversations** with @mentions
- **15+ built-in tools** (files, HTTP, system commands)
- **API integration** via OpenAPI schemas
- **MCP protocol** support
- **Event-driven processing** with callbacks
- **Persistent threads** and database storage

### 🧠 AI
Unified interface for 15+ AI providers across LLM, embedding, speech, and image generation.

```typescript
import { executeChat } from "copilotz/ai";

// LLM with any provider
const response = await executeChat({
  messages: [{ role: "user", content: "Explain AI" }]
}, {
  provider: "anthropic",  // or openai, gemini, groq, etc.
  model: "claude-3-5-sonnet-20241022"
});
```

**Supported Providers:**
- **LLM (6):** OpenAI, Anthropic, Google, Groq, DeepSeek, Ollama
- **Embeddings (3):** OpenAI, Cohere, HuggingFace  
- **Speech-to-Text (3):** OpenAI, AssemblyAI, Deepgram
- **Text-to-Speech (3):** OpenAI, ElevenLabs, Azure
- **Image Generation (3):** OpenAI, Stability AI, Replicate

### 📚 Knowledge
Document processing pipeline with extraction, chunking, embedding, and semantic search.

```typescript
import { knowledge } from "copilotz/knowledge";

const kb = await knowledge();

// Ingest documents
await kb.ingest({
  source: { type: "url", url: "https://example.com/doc.pdf" },
  collectionId: "research-docs"
});

// Semantic search
const results = await kb.search({
  query: "machine learning techniques",
  collectionId: "research-docs"
});
```

## 🚀 Quick Examples

### 1. Simple AI Call
```typescript
import { executeChat } from "copilotz/ai";

const response = await executeChat({
  messages: [{ role: "user", content: "Hello!" }]
}, { provider: "openai", model: "gpt-4o-mini" });

console.log(response.answer);
```

### 2. Agent Conversation
```typescript
import { createThread } from "copilotz/agents";

await createThread(
  { content: "Please read the README file and summarize it" },
  { 
    agents: [{
      name: "assistant",
      role: "Helper",
      instructions: "Help with file operations",
      allowedTools: ["read_file"],
      llmOptions: { provider: "openai", model: "gpt-4o-mini" }
    }]
  }
);
```

### 3. Multi-Agent Collaboration
```typescript
import { createThread } from "copilotz/agents";

const researcher = {
  name: "Researcher",
  role: "Research Specialist",
  instructions: "Research topics and gather information",
  allowedTools: ["http_request", "fetch_text"],
  allowedAgents: ["Writer"],
  llmOptions: { provider: "openai", model: "gpt-4o" }
};

const writer = {
  name: "Writer",
  role: "Content Creator", 
  instructions: "Write content based on research",
  allowedTools: ["write_file"],
  allowedAgents: ["Researcher"],
  llmOptions: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" }
};

await createThread(
  {
    content: "Research AI trends and write an article about them",
    participants: ["Researcher"] // Researcher starts, can @mention Writer
  },
  { agents: [researcher, writer] }
);
```

### 4. Production System (Stock Research)
```typescript
// See agents/examples/advanced/stock-researcher.ts for full implementation
import { runCli, createDatabase } from "copilotz/agents";

// Multi-agent financial research system
const coordinatorAgent = { /* coordinates research */ };
const researchAgent = { /* gathers financial data */ };
const analysisAgent = { /* analyzes data */ };
const reportAgent = { /* writes reports */ };

await runCli({
  participants: ["ResearchCoordinator"],
  agents: [coordinatorAgent, researchAgent, analysisAgent, reportAgent],
  apis: [alphaVantageAPI], // Auto-generated from OpenAPI schema
  dbInstance: await createDatabase({ url: "postgresql://..." })
});
```

## 🔧 Built-in Tools

The agents module includes 15+ ready-to-use tools:

**File System:**
- `read_file`, `write_file`, `list_directory`, `search_files`

**Network & APIs:**
- `http_request`, `fetch_text`

**System:**
- `run_command`, `get_current_time`

**Agent Communication:**
- `ask_question`, `create_thread`, `end_thread`

**Knowledge:**
- `knowledge_search`

**Utilities:**
- `verbal_pause`, `wait`, `create_task`

## 🌐 API Integration

Auto-generate tools from OpenAPI schemas:

```typescript
import { createThread } from "copilotz/agents";

const weatherAPI = {
  name: "weather-api",
  description: "Weather data service",
  openApiSchema: await loadOpenAPISchema("./weather-api.json"),
  auth: {
    type: 'apiKey',
    key: Deno.env.get("WEATHER_API_KEY"),
    name: 'X-API-Key',
    in: 'header'
  }
};

const weatherAgent = {
  name: "WeatherBot",
  role: "Weather Specialist",
  instructions: "Provide weather forecasts",
  allowedTools: [
    "getWeatherData",     // Auto-generated from OpenAPI
    "getForecast",        // Auto-generated from OpenAPI
    "getActiveAlerts"     // Auto-generated from OpenAPI
  ],
  llmOptions: { provider: "openai", model: "gpt-4o" }
};

await createThread(
  { content: "What's the weather in Seattle?", participants: ["WeatherBot"] },
  { agents: [weatherAgent], apis: [weatherAPI] }
);
```

## 🔌 MCP Integration

Connect to Model Context Protocol servers:

```typescript
import { createThread } from "copilotz/agents";

const mcpServer = {
  name: "database-server",
  description: "Database query server",
  transport: {
    type: "stdio",
    command: "npx",
    args: ["@modelcontextprotocol/server-postgres"]
  }
};

const dbAgent = {
  name: "DatabaseExpert",
  role: "Database Analyst", 
  instructions: "Query databases and analyze data",
  allowedTools: [
    "database-server_query_database",  // MCP tool
    "database-server_get_schema"       // MCP tool
  ],
  llmOptions: { provider: "openai", model: "gpt-4o" }
};

await createThread(
  { content: "Show me the user table schema", participants: ["DatabaseExpert"] },
  { agents: [dbAgent], mcpServers: [mcpServer] }
);
```

## 🎛️ Advanced Features

### Real-time Streaming
```typescript
const callbacks = {
  onTokenStream: (data) => {
    process.stdout.write(data.token);
  },
  onToolCalling: (data) => {
    console.log(`🔧 Calling: ${data.toolName}`);
  }
};

await createThread(message, { agents, callbacks, stream: true });
```

### Callback Interceptors
```typescript
const callbacks = {
  // Modify tool calls before execution
  onToolCalling: async (data) => {
    if (data.toolName === "http_request") {
      return {
        ...data,
        toolInput: {
          ...data.toolInput,
          headers: { ...data.toolInput.headers, "Custom": "header" }
        }
      };
    }
  },

  // Modify LLM responses
  onLLMCompleted: async (data) => {
    return {
      ...data,
      llmResponse: {
        ...data.llmResponse,
        answer: `😊 ${data.llmResponse.answer}`
      }
    };
  }
};
```

### Programmatic Agents
Mix AI and deterministic logic:

```typescript
const calculatorAgent = {
  name: "Calculator",
  role: "Math Processor",
  agentType: "programmatic", // Not AI-powered
  processingFunction: async ({ message }) => {
    const expr = message.content.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
    if (expr) {
      const [, a, op, b] = expr;
      const result = eval(`${a} ${op} ${b}`);
      return {
        content: `The answer is: ${result}`,
        shouldContinue: true
      };
    }
    return {
      content: "I can help with basic math like '5 + 3'",
      shouldContinue: true  
    };
  }
};
```

### Persistent Conversations
```typescript
// Start a conversation
await createThread(
  { 
    threadId: "project-planning-session",
    content: "Let's plan our new feature",
    participants: ["ProductManager", "Engineer"]
  },
  { agents: [pmAgent, engineerAgent] }
);

// Continue later with same threadId
await createThread(
  {
    threadId: "project-planning-session", // Same ID
    content: "Let's review yesterday's decisions"
  },
  { agents: [pmAgent, engineerAgent] }
);
```

## 🧪 Examples

**Beginner:**
- [`simple-assistant.ts`](./agents/examples/simple-assistant.ts) - Basic single agent
- [`two-assistants.ts`](./agents/examples/two-assistants.ts) - Agent-to-agent communication

**Intermediate:**
- [`programmatic-agent-example.ts`](./agents/examples/programmatic-agent-example.ts) - Mixed AI/programmatic agents
- [`weather-agent.ts`](./agents/examples/api/weather-agent.ts) - API integration

**Advanced:**
- [`stock-researcher.ts`](./agents/examples/advanced/stock-researcher.ts) - Financial research system
- [`authentication-examples.ts`](./agents/examples/api/authentication-examples.ts) - Secure API access
- [`mcp-client.ts`](./agents/examples/mcp/mcp-client.ts) - MCP protocol integration

## 🚀 Getting Started

### Prerequisites
- **Deno 2.0+**
- **PostgreSQL** (optional, uses in-memory SQLite by default)
- **API Keys** for providers you want to use

### Installation
```bash
# Import in your Deno project
import { createThread, runCli } from "copilotz/agents";
import { executeChat } from "copilotz/ai";
import { knowledge } from "copilotz/knowledge";
```

### Environment Variables
```bash
# LLM Providers
DEFAULT_OPENAI_KEY=sk-...
DEFAULT_ANTHROPIC_KEY=sk-ant-...
DEFAULT_GEMINI_KEY=...
DEFAULT_GROQ_KEY=...

# Other AI Services  
DEFAULT_ELEVENLABS_KEY=...
DEFAULT_STABILITY_KEY=sk-...

# Database (optional)
DATABASE_URL=postgresql://user:pass@host/db
```

### Quick Test
```bash
# Run a simple assistant
deno run --allow-all https://deno.land/x/copilotz/agents/examples/simple-assistant.ts

# Test AI providers
deno run --allow-all -e "
import { executeChat } from 'copilotz/ai';
const response = await executeChat({
  messages: [{ role: 'user', content: 'Hello!' }]
}, { provider: 'openai', model: 'gpt-4o-mini' });
console.log(response.answer);
"
```

## 📚 Documentation

- **[API Reference](./agents/docs/API_REFERENCE.md)** - Complete technical reference
- **[Tools Guide](./agents/docs/TOOLS.md)** - Built-in tools documentation
- **[Advanced Patterns](./agents/docs/PROGRAMMATIC_AGENTS_AND_OVERRIDES.md)** - Programmatic agents and interceptors
- **[Quick Start](./agents/docs/QUICK_START.md)** - Get running in 2 minutes

## 🧪 Testing

```bash
# Run all tests
deno test --allow-all

# Run specific module tests
deno test --allow-all agents/tests/
deno test --allow-all ai/tests/
```

## 🎯 Use Cases

### Enterprise Applications
- **Financial Research:** Multi-agent systems for investment analysis
- **Customer Support:** Intelligent routing and escalation
- **Content Operations:** Research → Write → Review → Publish pipelines
- **DevOps Automation:** Code generation, review, testing, deployment

### Developer Productivity
- **Code Assistants:** Context-aware programming help
- **Documentation:** Auto-generate docs from code
- **Testing:** Automated test generation and execution
- **Debugging:** AI-powered issue diagnosis

### Knowledge Management
- **Document Processing:** Extract, chunk, embed, and search
- **RAG Systems:** Retrieval-augmented generation
- **Research Workflows:** Automated information gathering
- **Q&A Systems:** Intelligent document querying

## 🤝 Contributing

We welcome contributions! Areas for enhancement:

- **Custom Tools** - Add domain-specific capabilities
- **New Providers** - Support additional AI services
- **Agent Types** - Create new agent behavior patterns
- **Integrations** - Connect with external systems

## 📄 License

[MIT License](./LICENSE)

---

**Ready to build the future?** Start with a [simple example](./agents/examples/simple-assistant.ts) or dive into the [advanced stock research system](./agents/examples/advanced/stock-researcher.ts)! 🚀
