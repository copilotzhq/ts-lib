# 📖 AgentsV2 API Reference

Complete technical reference for all interfaces, types, and functions in AgentsV2.

## 🏗️ Core Functions

### `copilotz(message, context)`

Main function to initiate agent conversations.

```typescript
function copilotz(
  initialMessage: ChatInitMessage,
  context: ChatContext = {}
): Promise<ChatManagementResult>
```

**Parameters:**
- `initialMessage` - Message configuration and participants
- `context` - Agents, tools, callbacks, and options

**Returns:** Promise resolving to conversation result with queue ID and thread ID.

### `initCopilotz(config?)`

Initialize global database instance for backward compatibility.

```typescript
function initCopilotz(config?: DatabaseConfig): Promise<void>
```

**Parameters:**
- `config` - Optional database configuration (defaults to `DATABASE_URL` env var)

### `createCopilotz(config?)`

Factory function to create isolated chat management instances.

```typescript
function createCopilotz(config?: DatabaseConfig): Promise<ChatManagementFunction>
```

**Parameters:**
- `config` - Optional database configuration

**Returns:** Promise resolving to isolated chat management function.

## 🎯 Core Types

### `AgentConfig`

Configuration for AI agents.

```typescript
interface AgentConfig {
  name: string;                    // Unique identifier for the agent
  role: string;                    // Agent's primary function/job
  personality: string;             // Behavioral characteristics
  instructions: string;            // Detailed behavior guidelines  
  description: string;             // What the agent does
  allowedTools?: string[];         // Tool keys this agent can use
  allowedAgents?: string[];        // Agent names this agent can communicate with
  llmOptions?: ProviderConfig;     // LLM configuration (provider, model, etc.)
}
```

**Example:**
```typescript
const developerAgent: AgentConfig = {
  name: "Developer",
  role: "Software Developer",
  personality: "Practical and detail-oriented", 
  instructions: "Write clean, maintainable code following best practices",
  description: "Develops and maintains software applications",
  allowedTools: ["read_file", "write_file", "run_command"],
  allowedAgents: ["Architect", "Tester"],
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1500
  }
};
```

### `ChatInitMessage`

Initial message configuration to start conversations.

```typescript
interface ChatInitMessage {
  threadId?: string;          // Optional existing thread ID
  senderId?: string;          // Message sender ID (defaults to "user")
  senderType?: "user" | "agent" | "tool" | "system";
  content: string;            // Message content
  threadName?: string;        // Name for new threads
  parentThreadId?: string;    // Parent thread for nested conversations
  participants?: string[];    // Filter agents that can participate
}
```

**Example:**
```typescript
const message: ChatInitMessage = {
  content: "Please analyze the codebase and suggest improvements",
  participants: ["Developer", "Architect"],
  threadName: "Code Review Session"
};
```

### `ChatContext`

Configuration for conversation behavior and capabilities.

```typescript
interface ChatContext {
  tools?: RunnableTool[];     // Custom tools available to agents
  stream?: boolean;           // Enable real-time token streaming
  activeTaskId?: string;      // Associate conversation with a task
  agents?: AgentConfig[];     // Agents available for this conversation
  callbacks?: ChatCallbacks;  // Event callbacks for monitoring
}
```

### `ChatCallbacks`

Enhanced event callbacks with interceptor support for real-time monitoring and behavior modification.

```typescript
interface ChatCallbacks {
  // Interceptor callbacks - can return modified data to override behavior
  onToolCalling?: (data: ToolCallingData) => void | Promise<void | ToolCallingResponse> | ToolCallingResponse;
  onToolCompleted?: (data: ToolCompletedData) => void | Promise<void | ToolCompletedResponse> | ToolCompletedResponse;
  onMessageReceived?: (data: MessageReceivedData) => void | Promise<void | MessageReceivedResponse> | MessageReceivedResponse;
  onMessageSent?: (data: MessageSentData) => void | Promise<void | MessageSentResponse> | MessageSentResponse;
  onLLMCompleted?: (data: LLMCompletedData) => void | Promise<void | LLMCompletedResponse> | LLMCompletedResponse;
  
  // Streaming callbacks - for real-time content delivery
  onTokenStream?: (data: TokenStreamData) => void | Promise<void> | TokenStreamData;
  onContentStream?: (data: ContentStreamData) => void | Promise<void> | ContentStreamData;
  onToolCallStream?: (data: ToolCallStreamData) => void | Promise<void> | ToolCallStreamData;
  
  // Interception monitoring
  onIntercepted?: (data: InterceptorData) => void | Promise<void> | InterceptorData;
}
```

**Interceptor Pattern:**
Callbacks can return modified data to override the original behavior. When a callback returns a modified object, the framework:
1. Uses the modified data instead of the original
2. Triggers the `onIntercepted` callback with details about what was changed
3. Continues processing with the modified data

**Example with Interception:**
```typescript
const callbacks: ChatCallbacks = {
  onToolCompleted: async (data) => {
    // Modify tool output
    if (data.toolName === "http_request" && data.toolOutput?.status === 401) {
      return {
        ...data,
        toolOutput: { 
          status: 200, 
          body: "Authentication refreshed" 
        }
      };
    }
    // Return undefined to not intercept
  },
  
  onIntercepted: async (data) => {
    console.log(`🔄 ${data.callbackType} intercepted for ${data.agentName}`);
    console.log('Original:', data.originalValue);
    console.log('Modified:', data.interceptedValue);
  }
};
```

### `RunnableTool`

Interface for creating custom tools.

```typescript
interface RunnableTool {
  key: string;                    // Unique tool identifier
  name: string;                   // Display name
  description: string;            // What the tool does
  inputSchema: object;            // JSON schema for input validation
  execute: (                      // Tool execution function
    params: any,
    context?: ToolExecutionContext
  ) => Promise<any>;
}
```

**Example:**
```typescript
const weatherTool: RunnableTool = {
  key: "get_weather",
  name: "Weather Information",
  description: "Get current weather information for a location",
  inputSchema: {
    type: "object",
    properties: {
      location: { 
        type: "string", 
        description: "City name or coordinates" 
      },
      units: { 
        type: "string", 
        enum: ["celsius", "fahrenheit"],
        default: "celsius"
      }
    },
    required: ["location"]
  },
  execute: async ({ location, units = "celsius" }, context) => {
    // Tool implementation
    const weatherData = await fetchWeatherAPI(location, units);
    return {
      location,
      temperature: weatherData.temp,
      condition: weatherData.condition,
      units
    };
  }
};
```

## 📊 Callback Data Types

### `ToolCallingData`

Data provided when agent starts using a tool.

```typescript
interface ToolCallingData {
  threadId: string;      // Conversation thread ID
  agentName: string;     // Name of agent calling the tool
  toolName: string;      // Name of tool being called
  toolInput: any;        // Input parameters for the tool
  toolCallId: string;    // Unique identifier for this tool call
  timestamp: Date;       // When the tool call started
}
```

### `ToolCompletedData`

Data provided when tool execution completes.

```typescript
interface ToolCompletedData {
  threadId: string;      // Conversation thread ID
  agentName: string;     // Name of agent that called the tool
  toolName: string;      // Name of tool that was called
  toolInput: any;        // Input parameters that were used
  toolCallId: string;    // Unique identifier for this tool call
  toolOutput?: any;      // Result from tool execution (if successful)
  error?: string;        // Error message (if failed)
  duration?: number;     // Execution time in milliseconds
  timestamp: Date;       // When the tool call completed
}
```

### `LLMCompletedData`

Comprehensive data about LLM interactions.

```typescript
interface LLMCompletedData {
  threadId: string;           // Conversation thread ID
  agentName: string;          // Name of agent making the LLM call
  systemPrompt: string;       // System prompt used
  messageHistory: any[];      // Complete message history sent to LLM
  availableTools: string[];   // Tool names available to the agent
  llmConfig?: any;           // LLM configuration used
  llmResponse?: {            // LLM response details
    success: boolean;        // Whether the call succeeded
    answer?: string;         // Text response from LLM
    toolCalls?: any[];       // Tools the LLM wants to call
    error?: string;          // Error message if failed
    tokens?: number;         // Token usage
    model?: string;          // Model that was used
    provider?: string;       // Provider that was used
  };
  duration?: number;         // LLM call duration in milliseconds
  timestamp: Date;           // When the LLM call completed
}
```

### `TokenStreamData`

Data for real-time token streaming (all tokens including tool calls).

```typescript
interface TokenStreamData {
  threadId: string;     // Conversation thread ID
  agentName: string;    // Name of agent generating tokens
  token: string;        // Individual token or chunk
  isComplete: boolean;  // Whether streaming is complete
}
```

### `ContentStreamData`

Data for content-only streaming (excludes tool call content).

```typescript
interface ContentStreamData {
  threadId: string;     // Conversation thread ID
  agentName: string;    // Name of agent generating content
  token: string;        // Content token or chunk
  isComplete: boolean;  // Whether content streaming is complete
}
```

### `ToolCallStreamData`

Data for tool call streaming (only tool call content).

```typescript
interface ToolCallStreamData {
  threadId: string;     // Conversation thread ID
  agentName: string;    // Name of agent making tool calls
  token: string;        // Tool call token or chunk
  isComplete: boolean;  // Whether tool call streaming is complete
}
```

### `InterceptorData`

Data about callback interceptions.

```typescript
interface InterceptorData {
  threadId: string;        // Conversation thread ID
  agentName: string;       // Name of agent whose data was intercepted
  callbackType: string;    // Which callback triggered the interception
  originalValue: any;      // Original data before interception
  interceptedValue: any;   // Modified data after interception
  timestamp: Date;         // When the interception occurred
}
```

### `MessageSentData` / `MessageReceivedData`

Data for message events.

```typescript
interface MessageSentData {
  threadId: string;                              // Conversation thread ID
  senderId: string;                              // ID of sender
  senderType: "user" | "agent" | "tool" | "system";  // Type of sender
  content: string;                               // Message content
  timestamp: Date;                               // When message was sent
}

interface MessageReceivedData {
  threadId: string;                              // Conversation thread ID
  senderId: string;                              // ID of sender
  senderType: "user" | "agent" | "tool" | "system";  // Type of sender
  content: string;                               // Message content
  timestamp: Date;                               // When message was received
}
```

## 🛠️ Native Tools Reference

### Core Communication Tools

#### `ask_question`
Direct agent-to-agent question.

```typescript
{
  question: string;      // Question to ask
  targetAgent: string;   // Name of agent to ask
  timeout?: number;      // Response timeout in seconds (default: 30)
}
```

#### `create_thread`
Create new conversation thread.

```typescript
{
  name: string;              // Thread name
  participants: string[];    // List of participant names
  initialMessage?: string;   // Optional first message
  mode?: "background" | "immediate";  // Processing mode
}
```

#### `end_thread`
Archive thread with summary.

```typescript
{
  summary: string;  // Summary of the conversation
}
```

#### `create_task`
Create trackable task.

```typescript
{
  name: string;    // Task name
  goal: string;    // Task objective
}
```

#### `verbal_pause`
Strategic pause in conversation.

```typescript
// No parameters
{}
```

### File System Tools

#### `read_file`
Read file contents.

```typescript
{
  path: string;           // File path (relative or absolute)
  encoding?: string;      // Text encoding (default: "utf-8")
}
```

#### `write_file`
Write or update file.

```typescript
{
  path: string;           // File path
  content: string;        // File content
  encoding?: string;      // Text encoding (default: "utf-8")
  createDirs?: boolean;   // Create directories if needed (default: true)
}
```

#### `list_directory`
List directory contents.

```typescript
{
  path: string;           // Directory path
  showHidden?: boolean;   // Include hidden files (default: false)
}
```

#### `search_files`
Search for files by pattern.

```typescript
{
  directory?: string;      // Search directory (default: current)
  pattern: string;         // Search pattern (supports wildcards)
  recursive?: boolean;     // Search subdirectories (default: true)
  includeHidden?: boolean; // Include hidden files (default: false)
}
```

### Network Tools

#### `http_request`
Make HTTP requests.

```typescript
{
  url: string;              // Request URL
  method?: string;          // HTTP method (default: "GET")
  headers?: object;         // Request headers
  body?: string;            // Request body
  timeout?: number;         // Timeout in seconds (default: 30)
}
```

#### `fetch_text`
Simple text fetching.

```typescript
{
  url: string;         // URL to fetch
  timeout?: number;    // Timeout in seconds (default: 30)
}
```

### System Tools

#### `run_command`
Execute system commands.

```typescript
{
  command: string;     // Command to execute
  args?: string[];     // Command arguments
  cwd?: string;        // Working directory
  timeout?: number;    // Timeout in seconds (default: 30)
}
```

### Utility Tools

#### `get_current_time`
Get current date/time.

```typescript
{
  format?: string;     // Format: "iso", "readable", "timestamp", "custom"
  timezone?: string;   // Timezone (default: system timezone)
}
```

#### `wait`
Wait for specified time.

```typescript
{
  seconds: number;  // Wait duration in seconds
}
```

## 🗄️ Database Schema Types

### Database Entities

```typescript
// Agent entity
type Agent = {
  id: string;
  name: string;
  role: string;
  personality?: string;
  instructions?: string;
  description?: string;
  capabilities?: string[];
  tools?: string[];
  createdAt: Date;
  updatedAt: Date;
};

// Thread entity
type Thread = {
  id: string;
  name: string;
  description?: string;
  participants?: string[];
  initialMessage?: string;
  mode: "background" | "immediate";
  status: "active" | "inactive" | "archived";
  summary?: string;
  parentThreadId?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Message entity
type Message = {
  id: string;
  threadId: string;
  senderId: string;
  senderType: "agent" | "user" | "system" | "tool";
  content?: string;
  toolCallId?: string;
  toolCalls?: object[];
  createdAt: Date;
};

// Task entity
type Task = {
  id: string;
  name: string;
  goal: string;
  successCriteria?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Tool log entity
type ToolLog = {
  id: string;
  threadId: string;
  taskId?: string;
  agentId?: string;
  toolName: string;
  toolInput?: object;
  toolOutput?: object;
  status: "success" | "error";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Queue entity
type Queue = {
  id: string;
  threadId: string;
  message: object;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
};
```

## 🔧 Database Configuration

### `DatabaseConfig`

Configuration for database connections.

```typescript
interface DatabaseConfig {
  url?: string;               // Database connection URL
  host?: string;              // Database host
  port?: number;              // Database port
  database?: string;          // Database name
  username?: string;          // Username
  password?: string;          // Password
  ssl?: boolean | object;     // SSL configuration
  poolSize?: number;          // Connection pool size
  connectionTimeout?: number; // Connection timeout in ms
}
```

**Examples:**

```typescript
// URL-based configuration
const config1: DatabaseConfig = {
  url: "postgresql://user:pass@localhost:5432/agents"
};

// Detailed configuration
const config2: DatabaseConfig = {
  host: "localhost",
  port: 5432,
  database: "agents",
  username: "user",
  password: "pass",
  ssl: false,
  poolSize: 10,
  connectionTimeout: 5000
};
```

## 🔒 Security Considerations

### Tool Security

All native tools include built-in security features:

- **Directory Traversal Protection**: File system tools prevent access outside allowed directories
- **Command Filtering**: System tools block dangerous commands
- **Input Validation**: All tools validate input parameters
- **Timeout Protection**: Network and system tools have configurable timeouts
- **Error Sanitization**: Error messages are sanitized to prevent information disclosure

### Agent Permissions

Control agent capabilities through configuration:

```typescript
const restrictedAgent: AgentConfig = {
  name: "RestrictedAgent",
  allowedTools: ["read_file"],           // Limited tool access
  allowedAgents: ["SupervisorAgent"],    // Limited agent communication
  llmOptions: {
    temperature: 0.1,                    // Conservative generation
    maxTokens: 500                       // Limited token usage
  }
};
```

### Best Practices

1. **Principle of Least Privilege**: Give agents only necessary permissions
2. **Input Validation**: Validate all user inputs before passing to agents
3. **Network Security**: Use timeouts and validate URLs for HTTP tools
4. **File System Security**: Use relative paths and validate file operations
5. **Error Handling**: Don't expose sensitive information in error messages

## 🚨 Error Handling

### Common Error Types

```typescript
// Agent not found
"Agent 'AgentName' not found in available agents"

// Tool not allowed
"Agent 'AgentName' is not allowed to use tool 'toolName'"

// Invalid participants
"No valid agents found from participants: ['Agent1', 'Agent2']"

// Database errors
"Database connection failed: connection timeout"

// Tool execution errors
"Tool 'toolName' failed: [specific error message]"
```

### Error Recovery Patterns

```typescript
try {
  const result = await copilotz(message, context);
} catch (error) {
  if (error.message.includes("not found")) {
    // Handle missing agent/tool
    console.log("Configuration error:", error.message);
  } else if (error.message.includes("database")) {
    // Handle database issues
    console.log("Database error:", error.message);
    // Retry logic or fallback
  } else {
    // Handle other errors
    console.log("Unexpected error:", error.message);
  }
}
```

## 📈 Performance Optimization

### Database Optimization

```typescript
// Use connection pooling
const config: DatabaseConfig = {
  url: "postgresql://user:pass@host:5432/db",
  poolSize: 20,
  connectionTimeout: 5000
};

// Use multiple instances for high load
const productionChat = await createCopilotz(prodConfig);
const developmentChat = await createCopilotz(devConfig);
```

### Agent Optimization

```typescript
// Limit tools to essentials
const optimizedAgent: AgentConfig = {
  name: "FastAgent",
  allowedTools: ["read_file", "write_file"], // Minimal tool set
  llmOptions: {
    temperature: 0.1,     // Lower creativity for faster responses
    maxTokens: 500        // Limit response length
  }
};
```

### Callback Optimization

```typescript
// Use efficient callbacks
const callbacks: ChatCallbacks = {
  onTokenStream: (data) => {
    // Avoid heavy processing in token stream
    streamBuffer.push(data.token);
  },
  onLLMCompleted: (data) => {
    // Heavy processing only after completion
    processResponse(data.llmResponse);
  }
};
```

---

This API reference provides complete technical details for all aspects of AgentsV2. For practical examples and getting started guides, see [README.md](./README.md) and [QUICK_START.md](./QUICK_START.md). 