# 🤖 Copilotz Agent Framework

> **Build sophisticated AI agent systems that can think, communicate, and act**

The Copilotz Agent framework enables you to create multi-agent systems where AI agents can communicate with each other, use tools, integrate with APIs, and execute both AI-powered and programmatic logic. Whether you need a simple assistant or a complex multi-agent workflow, this framework scales with your needs.

## ✨ Key Features

- 🧠 **Multi-Agent Conversations** - Agents that communicate and collaborate
- 🔧 **Rich Tool Ecosystem** - 15+ built-in tools for files, APIs, system commands, and more  
- 🌐 **API Integration** - Auto-generate tools from OpenAPI schemas
- 🔌 **MCP Protocol Support** - Connect to Model Context Protocol servers
- ⚡ **Programmatic Agents** - Mix AI and deterministic logic seamlessly
- 💾 **Persistent Threads** - Conversations that remember context
- 🎯 **Smart Agent Targeting** - @mentions automatically continue conversations
- 📡 **Real-time Streaming** - Live token streaming and callbacks
- 🎛️ **Interceptor System** - Modify agent behavior with custom logic

## 🚀 Quick Start

### 1. Simple Assistant (30 seconds)

```typescript
import { run, getNativeTools } from "copilotz/agents";

const agent = {
    name: "assistant",
    role: "Helpful Assistant", 
    personality: "Friendly and knowledgeable",
    instructions: "Help users with their questions and tasks",
    allowedTools: Object.keys(getNativeTools()),
    llmOptions: {
        provider: "openai",
        model: "gpt-4o-mini"
    }
};

// Start interactive session
run({
    agents: [agent],
    dbConfig: { url: ':memory:' }
});
```

### 2. Multi-Agent Collaboration

```typescript
import { run } from "copilotz/agents";

const researcher = {
    name: "Researcher",
    role: "Research Specialist",
    personality: "Thorough and analytical",
    instructions: "Research topics and gather information",
    allowedTools: ["http_request", "fetch_text"],
    allowedAgents: ["Writer"],
    llmOptions: { provider: "openai", model: "gpt-4o" }
};

const writer = {
    name: "Writer", 
    role: "Content Creator",
    personality: "Creative and articulate",
    instructions: "Write engaging content based on research",
    allowedTools: ["write_file"],
    allowedAgents: ["Researcher"],
    llmOptions: { provider: "openai", model: "gpt-4o" }
};

run({
    agents: [researcher, writer],
    participants: ["Researcher"], // Start with researcher
    dbConfig: { url: ':memory:' }
});

// Example conversation flow:
// User: "Research AI trends and write an article"
// Researcher: "I found great data on AI trends. @Writer, can you create an article with this research?"
// 👆 The @mention automatically continues the conversation so Writer can respond!
// Writer: "Thanks @Researcher! I'll create an engaging article with your findings..."
```

### 3. Programmatic + AI Agents

```typescript
import { createThread } from "copilotz/agents";

// Programmatic calculator agent
const calculator = {
    name: "Calculator",
    role: "Math Processor", 
    agentType: "programmatic",
    processingFunction: async ({ message }) => {
        const expr = message.content.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
        if (expr) {
            const [, a, op, b] = expr;
            const result = eval(`${a} ${op} ${b}`); // Use proper math parser in production
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

// AI assistant agent
const assistant = {
    name: "Assistant",
    role: "General Helper",
    agentType: "agentic", // AI-powered (default)
    personality: "Helpful and friendly",
    instructions: "Help users and work with other agents",
    allowedAgents: ["Calculator"],
    llmOptions: { provider: "openai", model: "gpt-4o-mini" }
};

await createThread(
    { 
        content: "@Calculator what is 15 * 27?",
        participants: ["Calculator", "Assistant"]
    },
    {
        agents: [calculator, assistant],
        dbConfig: { url: ':memory:' }
    }
);
```

## 🛠️ Built-in Tools

The framework includes 15+ native tools ready to use:

### File System
- `read_file` - Read file contents
- `write_file` - Write to files  
- `list_directory` - Browse directories
- `search_files` - Find files by pattern

### Network & APIs
- `http_request` - Make HTTP/REST calls
- `fetch_text` - Get text content from URLs

### System
- `run_command` - Execute shell commands
- `get_current_time` - Get current timestamp

### Agent Communication  
- `ask_question` - Query other agents
- `create_thread` - Start new conversations
- `end_thread` - Close conversations

### Utilities
- `verbal_pause` - Add thinking delays
- `wait` - Pause execution
- `create_task` - Schedule background tasks

## 🌐 API Integration

Auto-generate tools from OpenAPI schemas:

```typescript
import { createThread } from "copilotz/agents";

// Define API configuration
const weatherAPI = {
    name: "weather-api",
    description: "Weather data service",
    openApiSchema: await loadOpenAPISchema("./weather-api.json"),
    auth: {
        type: 'apiKey',
        key: process.env.WEATHER_API_KEY,
        name: 'X-API-Key',
        in: 'header'
    },
    headers: {
        "User-Agent": "CopilotzApp/1.0"
    }
};

const weatherAgent = {
    name: "WeatherBot",
    role: "Weather Specialist", 
    instructions: "Provide weather forecasts and alerts",
    allowedTools: [
        "getGridPoint",    // Auto-generated from OpenAPI
        "getForecast",     // Auto-generated from OpenAPI  
        "getActiveAlerts"  // Auto-generated from OpenAPI
    ],
    llmOptions: { provider: "openai", model: "gpt-4o" }
};

await createThread(
    { 
        content: "What's the weather in Seattle?",
        participants: ["WeatherBot"] 
    },
    {
        agents: [weatherAgent],
        apis: [weatherAPI],
        dbConfig: { url: ':memory:' }
    }
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
    },
    capabilities: ["query_database", "get_schema"]
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
    { 
        content: "Show me the user table schema",
        participants: ["DatabaseExpert"]
    },
    {
        agents: [dbAgent],
        mcpServers: [mcpServer],
        dbConfig: { url: 'postgresql://...' }
    }
);
```

## 🎛️ Advanced Features

### Callback Interceptors

Modify agent behavior in real-time with the enhanced callback system:

```typescript
const callbacks = {
    // Intercept and modify tool calls before execution
    onToolCalling: async (data) => {
        console.log(`🔧 ${data.agentName} calling ${data.toolName}`);
        
        // Modify tool input if needed
        if (data.toolName === "http_request") {
            return {
                ...data,
                toolInput: {
                    ...data.toolInput,
                    headers: { ...data.toolInput.headers, "X-Custom": "modified" }
                }
            };
        }
    },

    // Intercept and modify tool outputs after execution
    onToolCompleted: async (data) => {
        if (data.toolName === "http_request" && data.toolOutput?.status === 401) {
            return {
                ...data,
                toolOutput: { 
                    ...data.toolOutput,
                    body: "Authentication refreshed - retrying..."
                }
            };
        }
    },

    // Intercept and modify LLM responses
    onLLMCompleted: async (data) => {
        if (data.agentName === "Assistant") {
            return {
                ...data,
                llmResponse: {
                    ...data.llmResponse,
                    answer: `😊 ${data.llmResponse.answer} 😊`
                }
            };
        }
    },

    // Intercept messages before/after sending
    onMessageSent: async (data) => {
        if (data.senderId === "Calculator") {
            return {
                ...data,
                content: data.content.toUpperCase()
            };
        }
    },

    onMessageReceived: async (data) => {
        console.log(`📥 Received: ${data.content}`);
        // Modify message content if needed
        if (data.content.includes("urgent")) {
            return {
                ...data,
                content: `🚨 PRIORITY: ${data.content}`
            };
        }
    },

    // Monitor all interceptions
    onIntercepted: async (data) => {
        console.log(`🔄 Intercepted ${data.callbackType} for ${data.agentName}`);
        console.log(`   Original:`, data.originalValue);
        console.log(`   Modified:`, data.interceptedValue);
    }
};
```

### Real-time Streaming

Monitor agent responses as they're generated:

```typescript
const streamingCallbacks = {
    // Raw token streaming
    onTokenStream: (data) => {
        process.stdout.write(data.token);
        if (data.isComplete) console.log('\n--- Stream Complete ---');
    },

    // Content-only streaming (excludes tool calls)
    onContentStream: (data) => {
        process.stdout.write(data.token);
        if (data.isComplete) console.log('\n--- Content Complete ---');
    },

    // Tool call streaming (only tool call content)
    onToolCallStream: (data) => {
        console.log(`🔧 Tool call token: ${data.token}`);
        if (data.isComplete) console.log('--- Tool Call Complete ---');
    }
};

await createThread(
    { content: "Generate a report and save it", participants: ["Writer"] },
    { 
        agents: [writerAgent], 
        callbacks: streamingCallbacks,
        stream: true // Enable streaming
    }
);
```

### Database-Driven Configuration

Store and manage agent configurations dynamically with persistent connections:

```typescript
import { createDatabase } from "copilotz/agents";

// Create persistent database instance (reuse across requests)
let dbInstance: any = null;

async function getDatabase() {
    if (!dbInstance) {
        dbInstance = await createDatabase({ 
            url: process.env.DATABASE_URL || "postgresql://user:pass@host/db"
        });
        console.log("📦 Database connection established");
    }
    return dbInstance;
}

// Store configurations in database (one-time setup)
async function setupConfigurations() {
    const db = await getDatabase();
    const ops = db.operations;

    // Store agent configuration
    await ops.createAgent({
        name: "sales-agent",
        role: "Sales Representative", 
        instructions: "Help customers with product inquiries and sales",
        allowedTools: ["http_request", "write_file"],
        llmOptions: {
            provider: "openai",
            model: "gpt-4o",
            temperature: 0.7
        }
    });

    // Store API configuration
    await ops.createAPI({
        name: "crm-api",
        description: "Customer relationship management API", 
        openApiSchema: crmApiSchema,
        headers: { "Authorization": "Bearer TOKEN" }
    });
}

// Load and run agents (called per request in server environments)
async function handleRequest(userQuery: string) {
    const db = await getDatabase(); // Reuses existing connection
    const { agents, apis } = await loadResourcesFromDatabase(db);
    
    return await createThread(
        { content: userQuery, participants: ["sales-agent"] },
        { 
            agents, 
            apis, 
            dbInstance: db, // Pass existing instance
            callbacks: {
                onToolCompleted: async (data) => {
                    // Advanced media handling
                    const handleMedia = async ({ medias, sanitized }) => {
                        console.log(`Processing ${medias.length} media items`);
                        return sanitized;
                    };
                    
                    return utils.interceptors.toolCompleted.interceptMediaInToolOutput(
                        data, 
                        handleMedia
                    );
                }
            }
        }
    );
}

// Helper function to load resources from database
async function loadResourcesFromDatabase(db) {
    const ops = db.operations;
    
    const [dbAgents, dbApis] = await Promise.all([
        ops.getAllAgents(),
        ops.getAllAPIs()
    ]);
    
    const agents = dbAgents.map(agent => ({
        name: agent.name,
        role: agent.role,
        instructions: agent.instructions,
        allowedTools: agent.allowedTools,
        llmOptions: agent.llmOptions
    }));
    
    const apis = dbApis.map(api => ({
        name: api.name,
        description: api.description,
        openApiSchema: api.openApiSchema,
        headers: api.headers
    }));
    
    return { agents, apis };
}

// Server usage pattern
export default {
    async fetch(request: Request) {
        const { query } = await request.json();
        const result = await handleRequest(query);
        return Response.json(result);
    }
};
```

**Benefits of Persistent Database Connections:**
- ⚡ **Reduced Latency** - No connection overhead per request
- 🔄 **Connection Reuse** - Single pool shared across requests  
- 💾 **State Persistence** - Conversations and data survive across sessions
- 📈 **Scalability** - Efficient resource utilization in server environments

### Advanced Media Processing

Handle media content in tool outputs:

```typescript
const mediaCallbacks = {
    onToolCompleted: async (data) => {
        const processedMedias = [];
        
        const mediaHandler = async ({ medias, sanitized }) => {
            // Process each media item
            for (const media of medias) {
                const processedMedia = await processMedia(media);
                processedMedias.push(processedMedia);
            }
            
            return {
                ...sanitized,
                processedMedias
            };
        };
        
        return utils.interceptors.toolCompleted.interceptMediaInToolOutput(
            data,
            mediaHandler
        );
    }
};

async function processMedia(media) {
    // Custom media processing logic
    if (media.type === 'image') {
        return await optimizeImage(media);
    } else if (media.type === 'video') {
        return await compressVideo(media);
    }
    return media;
}
```

### Custom Tools

Create domain-specific tools:

```typescript
const customTool = {
    key: "analyze_sentiment",
    name: "Sentiment Analyzer",
    description: "Analyze text sentiment",
    inputSchema: {
        type: "object",
        properties: {
            text: { type: "string" }
        }
    },
    execute: async ({ text }) => {
        // Your sentiment analysis logic
        return { sentiment: "positive", confidence: 0.85 };
    }
};

await createThread(
    { content: "Analyze: 'I love this product!'", participants: ["Analyst"] },
    { 
        agents: [sentimentAgent], 
        tools: [customTool],
        dbConfig: { url: ':memory:' }
    }
);
```

### Persistent Conversations

Continue conversations across sessions:

```typescript
// Start a conversation
const result = await createThread(
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
        content: "Let's review yesterday's decisions",
        participants: ["ProductManager", "Engineer"]  
    },
    { agents: [pmAgent, engineerAgent] }
);
```

## 📚 Examples & Learning Path

### Beginner
- [`simple-assistant.ts`](./examples/simple-assistant.ts) - Basic single agent
- [`two-assistants.ts`](./examples/two-assistants.ts) - Agent-to-agent communication

### Intermediate  
- [`programmatic-agent-example.ts`](./examples/programmatic-agent-example.ts) - Mixed AI/programmatic agents
- [`weather-agent.ts`](./examples/api/weather-agent.ts) - API integration

### Advanced
- [`mcp-client.ts`](./examples/mcp/mcp-client.ts) - MCP protocol integration
- [`authentication-examples.ts`](./examples/api/authentication-examples.ts) - Secure API access

### Advanced Examples
- [`stock-researcher.ts`](./examples/advanced/stock-researcher.ts) - Financial research with Alpha Vantage API

### Production Ready
- [`simple.test.ts`](./tests/simple.test.ts) - Comprehensive testing patterns

## 🧪 Testing

Run the test suite to see all features in action:

```bash
# Run all tests
deno test agents/tests/

# Run specific test
deno test agents/tests/simple.test.ts

# Run with verbose output  
deno test --allow-all agents/tests/ -- --verbose
```

## 📖 Documentation

- **[Quick Start Guide](./docs/QUICK_START.md)** - Get running in 2 minutes
- **[API Reference](./docs/API_REFERENCE.md)** - Complete technical reference
- **[Tools Documentation](./docs/TOOLS.md)** - Built-in tools guide
- **[Programmatic Agents](./docs/PROGRAMMATIC_AGENTS_AND_OVERRIDES.md)** - Advanced agent patterns

## 🎯 Use Cases

### Customer Support
```typescript
// Route customers to specialized agents
const supportRouter = {
    name: "SupportRouter", 
    instructions: "Route customer issues to billing, technical, or general support agents",
    allowedAgents: ["BillingAgent", "TechnicalAgent", "GeneralAgent"]
};
```

### Content Creation Pipeline  
```typescript
// Research → Write → Review → Publish
const contentPipeline = [
    { name: "Researcher", allowedAgents: ["Writer"] },
    { name: "Writer", allowedAgents: ["Reviewer"] }, 
    { name: "Reviewer", allowedAgents: ["Publisher"] },
    { name: "Publisher", allowedTools: ["write_file", "http_request"] }
];
```

### Code Generation & Review
```typescript
// Architect → Developer → Reviewer → Tester
const devTeam = [
    { name: "Architect", instructions: "Design system architecture" },
    { name: "Developer", allowedTools: ["write_file", "run_command"] },
    { name: "Reviewer", instructions: "Review code quality and standards" },
    { name: "Tester", allowedTools: ["run_command", "read_file"] }
];
```

### Data Analysis Workflow
```typescript
// Collector → Processor → Analyst → Reporter  
const analyticsTeam = [
    { name: "DataCollector", allowedTools: ["http_request", "read_file"] },
    { name: "DataProcessor", agentType: "programmatic" }, // Custom logic
    { name: "Analyst", instructions: "Find insights and patterns" },
    { name: "Reporter", allowedTools: ["write_file"] }
];
```

## 🤝 Contributing

We welcome contributions! The framework is designed to be extensible:

- **Custom Tools** - Add domain-specific capabilities
- **New Providers** - Support additional LLM providers  
- **Agent Types** - Create new agent behavior patterns
- **Integrations** - Connect with external systems

## 📄 License

[View License](./LICENSE)

---

**Ready to build something amazing?** Start with the [Quick Start Guide](./docs/QUICK_START.md) or dive into the [examples](./examples/) to see the framework in action! 🚀
