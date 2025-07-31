# 🤖 Copilotz - Next-Generation AI Agent Framework

> **Powerful, Simple, Secure** - Build sophisticated multi-agent systems with minimal code.

Copilotz is a modern, TypeScript-first AI agent framework that enables you to create intelligent, collaborative agent systems. Built on the Oxian-js framework with PostgreSQL persistence and real-time capabilities.

## ✨ Why Copilotz?

- 🚀 **Zero Configuration** - Get started in 30 seconds
- 🔒 **Security First** - Built-in protection against common vulnerabilities
- 🛠️ **14 Native Tools** - File system, network, system commands, and more
- 💬 **Multi-Agent Conversations** - Agents communicate naturally with @mentions
- ⚡ **Real-time Streaming** - Live token streaming and event callbacks
- 📦 **Database Persistence** - Full conversation history and tool logs
- 🎯 **Task Management** - Built-in task creation and tracking
- 🔄 **Thread Management** - Organized conversations with participants

## 🚀 Quick Start

### 1. Initialize the Framework

```typescript
import { initCopilotz, copilotz, AgentConfig } from "./services/agents-v2/index.ts";

// Initialize with default database (uses DATABASE_URL env var)
await initCopilotz();

// Or with custom database
import { createCopilotz } from "./services/agents-v2/index.ts";
const chatManagement = await createCopilotz({
  url: "postgresql://user:pass@localhost:5432/mydb"
});
```

### 2. Create Your First Agent

```typescript
const myAgent: AgentConfig = {
  name: "Assistant",
  role: "Helpful AI Assistant",
  personality: "Friendly and knowledgeable",
  instructions: "Help users with their questions and tasks efficiently.",
  description: "A general-purpose assistant agent",
  allowedTools: ["http_request", "read_file", "write_file"],
  allowedAgents: [], // Can communicate with any agent
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1000,
  },
};
```

### 3. Start a Conversation

```typescript
const result = await copilotz(
  {
    content: "Hello! Please help me analyze the package.json file.",
    participants: ["Assistant"]
  },
  {
    agents: [myAgent],
    stream: true,
    callbacks: {
      onMessageSent: (data) => {
        console.log(`${data.senderId}: ${data.content}`);
      },
      onToolCalling: (data) => {
        console.log(`🔨 Using tool: ${data.toolName}`);
      }
    }
  }
);

console.log(`Conversation started: ${result.threadId}`);
```

## 🧪 Examples & Tutorials

Ready to see Copilotz in action? Check out our **[examples folder](./examples/)** with working code you can run immediately:

- **🚀 [Simple Researcher](./examples/simple-researcher.ts)** - Perfect starting point with web search
- **🔬 [Advanced Researcher](./examples/researcher-with-websearch.ts)** - Production-ready with full features
- **📚 [Examples Guide](./examples/README.md)** - Complete setup and usage instructions

```bash
# Try it now! (30 seconds)
cd services/agents-v2/examples
export DEFAULT_SERPER_KEY="your-key"  # Free from https://serper.dev
deno run --allow-all simple-researcher.ts interactive
```

## 🏗️ Core Concepts

### 🤖 Agents

Agents are AI personalities with specific roles, capabilities, and tool access:

```typescript
interface AgentConfig {
  name: string;           // Unique identifier
  role: string;           // Agent's primary function
  personality: string;    // How the agent behaves
  instructions: string;   // Detailed behavior guidelines
  description: string;    // What the agent does
  allowedTools?: string[];    // Tools this agent can use
  allowedAgents?: string[];   // Agents this agent can talk to
  llmOptions?: ProviderConfig; // LLM configuration
}
```

### 🧵 Threads

Conversations happen in threads with specific participants:

```typescript
// Threads are created automatically when you start a conversation
const result = await copilotz(
  {
    content: "Let's discuss the project architecture",
    participants: ["Architect", "Developer"], // Only these agents participate
    threadName: "Architecture Discussion"
  },
  { agents: [architectAgent, developerAgent] }
);
```

### 🛠️ Tools

Agents can use built-in tools or custom tools you define:

```typescript
// Custom tool example
const customTool: RunnableTool = {
  key: "weather_check",
  name: "Weather Checker",
  description: "Get current weather for a location",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string" }
    }
  },
  execute: async ({ location }) => {
    // Your weather API logic here
    return { weather: "sunny", temperature: "22°C" };
  }
};

// Use in agent configuration
const weatherAgent: AgentConfig = {
  name: "WeatherBot",
  allowedTools: ["weather_check", "http_request"],
  // ... other config
};
```

## 🌐 API & MCP Tools Integration

Copilotz supports seamless integration with external APIs and MCP (Model Context Protocol) servers, allowing agents to access a vast ecosystem of tools and services.

### API Tools (OpenAPI Schema)

Configure API tools using OpenAPI 3.0+ schemas. Each operation in the schema becomes a tool available to your agents:

```typescript
import { createThread, APIConfig } from "./services/agents/index.ts";

const weatherApi: APIConfig = {
    name: "weather-api",
    description: "Weather information API",
    baseUrl: "https://api.openweathermap.org/data/2.5",
    headers: { "Authorization": "Bearer your-api-key" },
    timeout: 30,
    openApiSchema: {
        openapi: "3.0.0",
        paths: {
            "/weather": {
                get: {
                    operationId: "getCurrentWeather",
                    summary: "Get current weather",
                    parameters: [/* OpenAPI parameters */],
                    responses: {/* OpenAPI responses */}
                }
            }
        }
    }
};

await createThread(
    { content: "What's the weather in New York?" },
    { 
        agents: [weatherAgent],
        apis: [weatherApi] // API tools auto-generated
    }
);
```

### MCP Server Tools

Connect to MCP servers using the **official MCP TypeScript SDK** ([documentation](https://modelcontextprotocol.io/quickstart/client#node)):

#### Stdio Transport (Currently Supported)
```typescript
import { MCPServerConfig } from "./services/agents/index.ts";

const mcpServer: MCPServerConfig = {
    name: "filesystem-mcp",
    description: "Local file system operations",
    transport: {
        type: "stdio",
        command: "npx", 
        args: ["@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    capabilities: ["read_file", "write_file"], // Optional filter
    env: { "NODE_ENV": "production" } // Optional environment variables
};
```

#### Usage with Agents
```typescript
await createThread(
    { content: "List files and read the README" },
    { 
        agents: [myAgent],
        mcpServers: [mcpServer] // Stdio transport via official SDK
    }
);
```

#### Transport Support Status
- ✅ **`stdio`**: Fully supported via official MCP SDK
- ⏳ **`sse`**: Waiting for official SDK support  
- ⏳ **`websocket`**: Waiting for official SDK support

> **Note**: We've migrated to the [official MCP TypeScript SDK](https://modelcontextprotocol.io/quickstart/client#node) for better reliability and future compatibility. SSE and WebSocket transports will be re-enabled when the official SDK adds support for them.

### Benefits

- **Zero Boilerplate**: OpenAPI operations and MCP tools become available automatically
- **Type Safety**: Full schema validation for API parameters  
- **Error Handling**: Built-in timeout, retry, and error management
- **Unified Interface**: Agents see all tools (native, API, MCP) consistently

## 🛠️ Built-in Tools (14 Total)

### 🔧 Core Tools
- **`verbal_pause`** - Make strategic pauses in conversation
- **`ask_question`** - Direct agent-to-agent questions
- **`create_thread`** - Start new conversation threads
- **`end_thread`** - Archive completed discussions
- **`create_task`** - Create trackable tasks

### 📁 File System Tools
- **`read_file`** - Read local files safely
- **`write_file`** - Write files with directory creation
- **`list_directory`** - Browse directory contents
- **`search_files`** - Find files by pattern

### 🌐 Network Tools
- **`http_request`** - Full HTTP client functionality
- **`fetch_text`** - Simple text fetching

### 💻 System Tools
- **`run_command`** - Execute system commands safely

### 🛠️ Utility Tools
- **`get_current_time`** - Time/date in multiple formats
- **`wait`** - Controlled delays

> 🔒 **All tools include built-in security**: directory traversal protection, command filtering, timeout controls, and input validation.

## 💬 Multi-Agent Communication

### Direct Mentions
Use @mentions to target specific agents:

```typescript
const result = await copilotz(
  {
    content: "Hey @DataAnalyst, can you check the user metrics? @Developer, prepare the dashboard updates.",
    participants: ["Manager", "DataAnalyst", "Developer"]
  },
  { agents: [managerAgent, analystAgent, developerAgent] }
);
```

### Agent-to-Agent Communication
Agents can communicate with each other using tools:

```typescript
// Agent A can ask Agent B a question
const questionResult = await tools.ask_question.execute({
  question: "What's the current server status?",
  targetAgent: "SysAdmin"
});

// Or create a dedicated thread for longer discussions
const threadResult = await tools.create_thread.execute({
  name: "Performance Investigation",
  participants: ["DevOps", "Database"],
  initialMessage: "We need to investigate the recent slowdowns"
});
```

### Participant Filtering
Control which agents can participate in conversations:

```typescript
// Only specific agents participate
const result = await copilotz(
  {
    content: "Confidential discussion about security vulnerabilities",
    participants: ["SecurityExpert", "LeadDeveloper"] // Others filtered out
  },
  {
    agents: [securityAgent, leadDevAgent, juniorDevAgent] // All available, but juniorDev filtered out
  }
);
```

## 📊 Real-time Events & Streaming

Get live updates on agent activities:

```typescript
const result = await copilotz(
  {
    content: "Analyze this large dataset",
    participants: ["DataScientist"]
  },
  {
    agents: [dataScientistAgent],
    stream: true, // Enable token streaming
    callbacks: {
      onTokenStream: (data) => {
        process.stdout.write(data.token); // Live typing effect
      },
      onToolCalling: (data) => {
        console.log(`🔨 ${data.agentName} is using ${data.toolName}`);
      },
      onToolCompleted: (data) => {
        console.log(`✅ ${data.toolName} completed ${data.error ? 'with error' : 'successfully'}`);
        if (data.duration) console.log(`⏱️ Took ${data.duration}ms`);
      },
      onLLMCompleted: (data) => {
        console.log(`🧠 ${data.agentName} completed LLM call`);
        console.log(`📊 Tokens used: ${data.llmResponse?.tokens}`);
        console.log(`🔧 Tools called: ${data.llmResponse?.toolCalls?.length || 0}`);
      }
    }
  }
);
```

## 🎯 Task Management

Create and track tasks within conversations:

```typescript
// Agent can create tasks
const taskAgent: AgentConfig = {
  name: "ProjectManager",
  allowedTools: ["create_task"],
  instructions: "Create and track project tasks efficiently"
};

// Task will be created automatically when agent uses the tool
const result = await copilotz(
  {
    content: "Please create a task to implement the new user authentication system",
    participants: ["ProjectManager"]
  },
  {
    agents: [taskAgent],
    callbacks: {
      onToolCompleted: (data) => {
        if (data.toolName === "create_task") {
          console.log(`📋 Task created: ${JSON.stringify(data.toolOutput)}`);
        }
      }
    }
  }
);
```

## 🔧 Advanced Configuration

### Multiple Database Instances

```typescript
// Different databases for different purposes
const productionChat = await createCopilotz({
  url: "postgresql://user:pass@prod-db:5432/agents"
});

const developmentChat = await createCopilotz({
  url: "postgresql://user:pass@dev-db:5432/agents_dev"
});

// Use independently
await productionChat(message, context);
await developmentChat(message, context);
```

### Agent Permission System

```typescript
const restrictedAgent: AgentConfig = {
  name: "JuniorDev",
  allowedTools: ["read_file", "list_directory"], // Limited tools
  allowedAgents: ["Mentor", "TeamLead"], // Can only talk to specific agents
  // ... other config
};

const mentorAgent: AgentConfig = {
  name: "Mentor",
  allowedTools: ["read_file", "write_file", "run_command"], // More tools
  allowedAgents: ["JuniorDev", "SeniorDev"], // Can guide juniors
  // ... other config
};
```

### Custom LLM Providers

```typescript
const customAgent: AgentConfig = {
  name: "SpecializedAgent",
  llmOptions: {
    provider: "anthropic",
    model: "claude-3-sonnet",
    temperature: 0.3,
    maxTokens: 2000,
    topP: 0.9
  }
  // ... other config
};
```

## 📚 Database Schema

Copilotz automatically manages these tables:

- **`agents`** - Agent configurations (optional, for persistence)
- **`threads`** - Conversation threads
- **`messages`** - All conversation messages
- **`tasks`** - Created tasks with status tracking
- **`tool_logs`** - Complete tool execution history
- **`queue`** - Message processing queue

## 🧪 Testing Your Agents

Use the built-in test patterns:

```typescript
import { assert, assertExists } from "jsr:@std/assert";

Deno.test("My Agent Test", async () => {
  await initCopilotz();
  
  const result = await copilotz(
    {
      content: "Test message",
      participants: ["TestAgent"]
    },
    {
      agents: [testAgent],
      callbacks: {
        onLLMCompleted: (data) => {
          console.log(`Agent responded: ${data.llmResponse?.answer}`);
        }
      }
    }
  );

  assertExists(result.queueId);
  assert(result.status === "queued");
});
```

## 🚀 Real-World Examples

### 1. Development Team Simulation

```typescript
const architect: AgentConfig = {
  name: "Architect",
  role: "Software Architect",
  personality: "Strategic and detail-oriented",
  instructions: "Design system architecture and guide technical decisions",
  allowedTools: ["read_file", "write_file", "create_thread", "ask_question"],
  allowedAgents: ["Developer", "DevOps"]
};

const developer: AgentConfig = {
  name: "Developer",
  role: "Software Developer", 
  personality: "Practical and solution-focused",
  instructions: "Implement features and write code based on specifications",
  allowedTools: ["read_file", "write_file", "run_command", "http_request"],
  allowedAgents: ["Architect", "Tester"]
};

const devops: AgentConfig = {
  name: "DevOps",
  role: "DevOps Engineer",
  personality: "Reliability-focused and systematic",
  instructions: "Handle deployment, monitoring, and infrastructure",
  allowedTools: ["run_command", "http_request", "read_file"],
  allowedAgents: ["Architect", "Developer"]
};

// Start a project discussion
const result = await copilotz(
  {
    content: "We need to plan the new microservices architecture for the e-commerce platform. @Architect, please lead this discussion.",
    participants: ["Architect", "Developer", "DevOps"]
  },
  { agents: [architect, developer, devops] }
);
```

### 2. Content Creation Pipeline

```typescript
const researcher: AgentConfig = {
  name: "Researcher",
  role: "Content Researcher",
  allowedTools: ["http_request", "fetch_text", "write_file"],
  instructions: "Research topics and gather information from web sources"
};

const writer: AgentConfig = {
  name: "Writer", 
  role: "Content Writer",
  allowedTools: ["read_file", "write_file", "ask_question"],
  instructions: "Create engaging content based on research"
};

const editor: AgentConfig = {
  name: "Editor",
  role: "Content Editor", 
  allowedTools: ["read_file", "write_file"],
  instructions: "Review and improve content for clarity and style"
};

// Content creation workflow
const result = await copilotz(
  {
    content: "Let's create a comprehensive blog post about TypeScript best practices. @Researcher, please gather the latest information.",
    participants: ["Researcher", "Writer", "Editor"]
  },
  { agents: [researcher, writer, editor] }
);
```

### 3. Customer Support System

```typescript
const supportAgent: AgentConfig = {
  name: "Support",
  role: "Customer Support Agent",
  allowedTools: ["http_request", "create_task", "ask_question"],
  allowedAgents: ["TechnicalExpert", "BillingExpert"],
  instructions: "Help customers with their questions and escalate when needed"
};

const technicalExpert: AgentConfig = {
  name: "TechnicalExpert", 
  role: "Technical Support Specialist",
  allowedTools: ["run_command", "read_file", "http_request"],
  instructions: "Solve complex technical issues"
};

const billingExpert: AgentConfig = {
  name: "BillingExpert",
  role: "Billing Specialist", 
  allowedTools: ["http_request"],
  instructions: "Handle billing and payment related issues"
};
```

## 🔍 Debugging and Monitoring

### Comprehensive Logging

```typescript
const result = await copilotz(
  {
    content: "Debug this complex workflow",
    participants: ["DebugAgent"]
  },
  {
    agents: [debugAgent],
    callbacks: {
      onLLMCompleted: (data) => {
        console.log(`\n🔍 LLM Debug for ${data.agentName}:`);
        console.log(`📚 Message History (${data.messageHistory.length} messages)`);
        console.log(`🔧 Available Tools: [${data.availableTools.join(', ')}]`);
        console.log(`📤 Response: ${data.llmResponse?.success ? '✅ Success' : '❌ Failed'}`);
        console.log(`⏱️ Duration: ${data.duration}ms`);
      },
      onToolCalling: (data) => {
        console.log(`🔨 Tool Call: ${data.toolName} by ${data.agentName}`);
        console.log(`📥 Input:`, JSON.stringify(data.toolInput, null, 2));
      },
      onToolCompleted: (data) => {
        console.log(`✅ Tool Complete: ${data.toolName}`);
        if (data.error) console.log(`❌ Error:`, data.error);
        if (data.duration) console.log(`⏱️ Duration: ${data.duration}ms`);
      }
    }
  }
);
```

## 📈 Performance Tips

1. **Use Participant Filtering** - Limit agents to only those needed for each conversation
2. **Tool Selection** - Give agents only the tools they actually need
3. **Stream When Possible** - Use streaming for better user experience
4. **Database Optimization** - Use appropriate indexes for your query patterns
5. **LLM Configuration** - Tune temperature and token limits for your use case

## 🛡️ Security Best Practices

1. **Principle of Least Privilege** - Give agents minimal required permissions
2. **Input Validation** - All tools have built-in validation, but validate your custom tools
3. **Network Security** - Use timeouts and validate URLs for HTTP tools
4. **File System Security** - Built-in directory traversal protection
5. **Command Execution** - Dangerous commands are automatically blocked

## 🔧 Migration from AgentsV1

Copilotz is a complete rewrite with breaking changes but significant improvements:

### Key Differences:
- **Simplified API** - Single function instead of complex plugin system
- **Better Type Safety** - Full TypeScript support throughout
- **Enhanced Security** - Built-in protections for all operations
- **Real-time Features** - Streaming and comprehensive callbacks
- **Database Integration** - Full persistence and history tracking

### Migration Steps:
1. Update your agent configurations to use `AgentConfig` interface
2. Replace plugin-based tools with built-in tools or custom `RunnableTool`s
3. Update your conversation initiation to use the new `copilotz()` function
4. Add database initialization with `initCopilotz()`

## 🤝 Contributing

We welcome contributions! The framework is designed to be extensible:

1. **Custom Tools** - Add new capabilities by implementing `RunnableTool`
2. **LLM Providers** - Extend the AI service with new providers
3. **Database Backends** - Support additional database types
4. **Security Features** - Enhance protection mechanisms

## 📄 License

MIT License - See LICENSE file for details.

---

**Built with ❤️ for the AI agent community**

Start building your next-generation AI agent system today! 🚀 