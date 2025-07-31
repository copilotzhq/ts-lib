# 🚀 AgentsV2 Quick Start Guide

> Get your first AI agent conversation running in under 2 minutes!

## ⚡ 30-Second Setup

```typescript
// 1. Import and initialize
import { initCopilotz, copilotz, AgentConfig } from "./services/agents-v2/index.ts";
await initCopilotz();

// 2. Create an agent
const assistant: AgentConfig = {
  name: "Assistant",
  role: "AI Helper",
  personality: "Friendly and helpful",
  instructions: "Help users with their tasks",
  description: "A general-purpose assistant",
  allowedTools: ["read_file", "write_file", "http_request"],
  llmOptions: { provider: "openai", model: "gpt-4o-mini" }
};

// 3. Start chatting
const result = await copilotz(
  { content: "Hello! Can you help me?", participants: ["Assistant"] },
  { agents: [assistant] }
);

console.log(`Chat started: ${result.threadId}`);
```

## 🧪 Try Live Examples

Want to see real web-enabled agents in action? 

```bash
# Navigate to examples
cd services/agents-v2/examples

# Set API key (free from https://serper.dev)
export DEFAULT_SERPER_KEY="your-key"

# Run interactive research agent
deno run --allow-all simple-researcher.ts interactive
```

Ask questions like:
- "What are the latest AI trends in 2024?"
- "Compare Python vs TypeScript for backend development"
- "Research the current state of electric vehicles"

See **[examples folder](./examples/)** for more!

## 🔧 Essential Patterns

### Single Agent Conversation
```typescript
const result = await copilotz(
  { content: "Analyze the package.json file", participants: ["Developer"] },
  { agents: [developerAgent] }
);
```

### Multi-Agent Collaboration
```typescript
const result = await copilotz(
  { 
    content: "@Researcher find info about TypeScript, @Writer create a blog post", 
    participants: ["Researcher", "Writer"] 
  },
  { agents: [researcherAgent, writerAgent] }
);
```

### Real-time Streaming
```typescript
const result = await copilotz(
  { content: "Write a long article", participants: ["Writer"] },
  { 
    agents: [writerAgent], 
    stream: true,
    callbacks: {
      onTokenStream: (data) => process.stdout.write(data.token),
      onToolCalling: (data) => console.log(`🔨 Using: ${data.toolName}`)
    }
  }
);
```

## 🛠️ Essential Tools Cheat Sheet

| Tool | Purpose | Example Use |
|------|---------|-------------|
| `read_file` | Read files | Config analysis, code review |
| `write_file` | Create/update files | Generate code, save reports |
| `http_request` | API calls | Fetch data, webhooks |
| `ask_question` | Agent-to-agent | Quick questions |
| `create_thread` | New conversations | Focused discussions |
| `list_directory` | Browse files | Project exploration |
| `run_command` | Execute commands | Build, test, deploy |

## 👥 Agent Examples

### Developer Agent
```typescript
const developer: AgentConfig = {
  name: "Developer",
  role: "Software Developer",
  personality: "Practical and thorough",
  instructions: "Write clean code and follow best practices",
  allowedTools: ["read_file", "write_file", "run_command", "list_directory"],
  llmOptions: { provider: "openai", model: "gpt-4o-mini", temperature: 0.3 }
};
```

### Research Agent
```typescript
const researcher: AgentConfig = {
  name: "Researcher", 
  role: "Information Gatherer",
  personality: "Curious and methodical",
  instructions: "Find accurate, up-to-date information",
  allowedTools: ["http_request", "fetch_text", "write_file"],
  llmOptions: { provider: "openai", model: "gpt-4o-mini", temperature: 0.7 }
};
```

### Project Manager Agent
```typescript
const pm: AgentConfig = {
  name: "ProjectManager",
  role: "Project Coordinator", 
  personality: "Organized and goal-oriented",
  instructions: "Coordinate tasks and track progress",
  allowedTools: ["create_task", "create_thread", "ask_question"],
  allowedAgents: ["Developer", "Designer"], // Can only talk to these agents
  llmOptions: { provider: "openai", model: "gpt-4o-mini" }
};
```

## 🔄 Common Workflows

### Code Review Workflow
```typescript
// 1. Developer creates code
await copilotz(
  { content: "Create a new user authentication module", participants: ["Developer"] },
  { agents: [developer] }
);

// 2. Senior dev reviews
await copilotz(
  { content: "@SeniorDev please review the auth module", participants: ["Developer", "SeniorDev"] },
  { agents: [developer, seniorDev] }
);
```

### Content Creation Pipeline
```typescript
await copilotz(
  { 
    content: "Create a blog post about AI trends: @Researcher gather info, @Writer draft content, @Editor review",
    participants: ["Researcher", "Writer", "Editor"]
  },
  { agents: [researcher, writer, editor] }
);
```

### Customer Support Escalation
```typescript
await copilotz(
  { 
    content: "Customer has billing issue with premium plan",
    participants: ["Support"] 
  },
  { 
    agents: [support, billingExpert, techExpert],
    callbacks: {
      onToolCalling: (data) => {
        if (data.toolName === "ask_question") {
          console.log(`🎫 Escalating to expert: ${JSON.stringify(data.toolInput)}`);
        }
      }
    }
  }
);
```

## 🎯 Pro Tips

### 1. Use Participant Filtering
```typescript
// Only these agents can participate (others are filtered out)
const result = await copilotz(
  { content: "Sensitive discussion", participants: ["Lead", "Senior"] },
  { agents: [lead, senior, junior] } // junior filtered out
);
```

### 2. Tool Permissions
```typescript
const restrictedAgent: AgentConfig = {
  name: "Intern",
  allowedTools: ["read_file", "list_directory"], // No write/execute permissions
  allowedAgents: ["Mentor"], // Can only talk to mentor
  // ... other config
};
```

### 3. Database per Environment
```typescript
// Production
const prodChat = await createCopilotz({ 
  url: "postgresql://user:pass@prod:5432/agents" 
});

// Development  
const devChat = await createCopilotz({
  url: "postgresql://user:pass@dev:5432/agents_dev"
});
```

### 4. Custom Tools
```typescript
const weatherTool: RunnableTool = {
  key: "get_weather",
  name: "Weather Checker", 
  description: "Get current weather",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } }
  },
  execute: async ({ city }) => {
    // Your weather API logic
    return { weather: "sunny", temp: "22°C" };
  }
};

// Use in agent
const weatherAgent: AgentConfig = {
  name: "WeatherBot",
  allowedTools: ["get_weather"],
  // ... other config
};
```

## 🐛 Debugging

### Basic Debugging
```typescript
const result = await copilotz(
  { content: "Debug message", participants: ["Agent"] },
  {
    agents: [agent],
    callbacks: {
      onLLMCompleted: (data) => {
        console.log(`Agent: ${data.agentName}`);
        console.log(`Success: ${data.llmResponse?.success}`);
        console.log(`Tools used: ${data.llmResponse?.toolCalls?.length || 0}`);
      }
    }
  }
);
```

### Full Debug Mode
```typescript
const debugCallbacks = {
  onMessageReceived: (data) => console.log(`📨 Received: ${data.content}`),
  onMessageSent: (data) => console.log(`📤 Sent: ${data.content}`),
  onToolCalling: (data) => console.log(`🔨 Tool: ${data.toolName}`),
  onToolCompleted: (data) => console.log(`✅ Done: ${data.toolName} ${data.error ? '❌' : '✅'}`),
  onLLMCompleted: (data) => console.log(`🧠 LLM: ${data.duration}ms`)
};
```

## ❓ Common Issues

### "No agents provided"
```typescript
// ❌ Wrong
await copilotz({ content: "Hello" }, {});

// ✅ Correct
await copilotz({ content: "Hello", participants: ["Agent"] }, { agents: [agent] });
```

### "Agent not found"
```typescript
// ❌ Wrong - typo in participant name
await copilotz(
  { content: "Hello", participants: ["Assisant"] }, // typo!
  { agents: [{ name: "Assistant", ... }] }
);

// ✅ Correct - names match exactly
await copilotz(
  { content: "Hello", participants: ["Assistant"] },
  { agents: [{ name: "Assistant", ... }] }
);
```

### Database not initialized
```typescript
// ❌ Wrong - forgot to initialize
await copilotz(...);

// ✅ Correct - initialize first
await initCopilotz();
await copilotz(...);
```

## 🎉 You're Ready!

Start with a simple single-agent conversation, then gradually add:
1. More agents
2. Custom tools
3. Real-time callbacks
4. Advanced workflows

Check out the full [README.md](./README.md) for comprehensive documentation!

---

**Happy coding! 🚀** 