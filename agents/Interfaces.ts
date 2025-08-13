import type {
    agents,
    tools,
    threads,
    tasks,
    messages,
    tool_logs,
    queue,
    mcpServers,
    apis,
    users
} from "./database/index.ts";

import type { ProviderConfig } from "../ai/llm/types.ts";

export type Agent = typeof agents.$inferSelect;
export type Tool = typeof tools.$inferSelect;

import type { DatabaseConfig } from "./database/index.ts";

export type { DatabaseConfig }

// Tool execution context - passed to tools when they're executed
export interface ToolExecutionContext {
    threadId?: string;
    senderId?: string;
    senderType?: "user" | "agent" | "tool" | "system";
    agents?: AgentConfig[];
    tools?: RunnableTool[];
    callbacks?: ChatCallbacks;
    stream?: boolean;
    activeTaskId?: string;
    db?: any; // Database instance for tools that need database access
}

export interface RunnableTool
    extends Omit<
        typeof tools.$inferInsert,
        "id" | "createdAt" | "updatedAt"
    > {
    execute: (
        params: any,
        context?: ToolExecutionContext
    ) => Promise<any>;
}

// Agent types
export type AgentType = "agentic" | "programmatic";

// Programmatic agent processing function
export interface ProgrammaticProcessingFunction {
    (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> | ProgrammaticAgentOutput;
}

// Input for programmatic agents
export interface ProgrammaticAgentInput {
    message: NewMessage;
    context: MessageProcessingContext;
    chatContext: ChatContext;
}

// Output for programmatic agents (matches agent response format)
export interface ProgrammaticAgentOutput {
    content?: string;
    toolCalls?: any[];
    shouldContinue?: boolean; // Whether to continue processing in the queue
}

export interface AgentConfig
    extends Omit<
        typeof agents.$inferInsert,
        "id" | "createdAt" | "updatedAt"
    > {
    llmOptions?: ProviderConfig;
    allowedAgents?: string[]; // Array of agent names this agent can communicate with
    allowedTools?: string[]; // Array of tool keys this agent can use
    agentType?: AgentType; // Type of agent - defaults to "agentic"
    processingFunction?: ProgrammaticProcessingFunction; // For programmatic agents
}

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ToolLog = typeof tool_logs.$inferSelect;
export type NewToolLog = typeof tool_logs.$inferInsert;

export type Queue = typeof queue.$inferSelect;
export type NewQueue = typeof queue.$inferInsert;

export type User = typeof users.$inferSelect;

// Chat framework initialization types
export interface ChatInitMessage {
    threadId?: string;
    threadExternalId?: string; // Optional external thread identifier
    senderId?: string;
    senderType?: "user" | "agent" | "tool" | "system";
    content: string;
    threadName?: string;
    parentThreadId?: string;
    participants?: string[]; // Filter agents available for this conversation
    user?: {
        id?: string;
        externalId?: string;
        name?: string;
        email?: string;
        metadata?: any;
    };
}

// Callback data types
export interface ToolCallingData {
    threadId: string;
    agentName: string;
    toolName: string;
    toolInput: any;
    toolCallId: string;
    timestamp: Date;
}

export interface ToolCompletedData {
    threadId: string;
    agentName: string;
    toolName: string;
    toolInput: any;
    toolCallId: string;
    toolOutput?: any;
    error?: string;
    duration?: number;
    timestamp: Date;
}

export interface MessageReceivedData {
    threadId: string;
    senderId: string;
    senderType: "user" | "agent" | "tool" | "system";
    content: string;
    timestamp: Date;
}

export interface MessageSentData {
    threadId: string;
    senderId: string;
    senderType: "user" | "agent" | "tool" | "system";
    content: string;
    timestamp: Date;
}

export interface LLMCompletedData {
    threadId: string;
    agentName: string;
    systemPrompt: string;
    messageHistory: any[]; // LLM-formatted message history
    availableTools: string[]; // Tool names available to the agent
    llmConfig?: any; // LLM configuration used
    llmResponse?: {
        success: boolean;
        answer?: string;
        toolCalls?: any[];
        error?: string;
        tokens?: number;
        model?: string;
        provider?: string;
    };
    duration?: number; // LLM call duration in milliseconds
    timestamp: Date;
}

export interface TokenStreamData {
    threadId: string;
    agentName: string;
    token: string;
    isComplete: boolean;
}

export interface ContentStreamData {
    threadId: string;
    agentName: string;
    token: string;
    isComplete: boolean;
}

export interface ToolCallStreamData {
    threadId: string;
    agentName: string;
    token: string;
    isComplete: boolean;
}

// Interceptor data types
export interface InterceptorData {
    threadId: string;
    agentName: string;
    callbackType: string; // Which callback triggered the interception
    originalValue: any;
    interceptedValue: any;
    timestamp: Date;
}


// Tool callbacks with interceptor support

export type ToolCallingResponse = ToolCallingData | undefined;
export type ToolCompletedResponse = ToolCompletedData | undefined;
export type MessageReceivedResponse = MessageReceivedData | undefined;
export type MessageSentResponse = MessageSentData | undefined;
export type LLMCompletedResponse = LLMCompletedData | undefined;

// Enhanced callback types that can return values for interception
export interface ChatCallbacks {
    onToolCalling?: (data: ToolCallingData) => void | Promise<void | ToolCallingResponse> | ToolCallingResponse;
    onToolCompleted?: (data: ToolCompletedData) => void | Promise<void | ToolCompletedResponse> | ToolCompletedResponse;
    onMessageReceived?: (data: MessageReceivedData) => void | Promise<void | MessageReceivedResponse> | MessageReceivedResponse;
    onMessageSent?: (data: MessageSentData) => void | Promise<void | MessageSentResponse> | MessageSentResponse;
    onTokenStream?: (data: TokenStreamData) => void | Promise<void> | TokenStreamData;
    onContentStream?: (data: ContentStreamData) => void | Promise<void> | ContentStreamData;
    onToolCallStream?: (data: ToolCallStreamData) => void | Promise<void> | ToolCallStreamData;
    onLLMCompleted?: (data: LLMCompletedData) => void | Promise<void | LLMCompletedResponse> | LLMCompletedResponse;
    onIntercepted?: (data: InterceptorData) => void | Promise<void> | InterceptorData; // New callback for interceptions
}

// API Configuration for OpenAPI schema tools
export type APIConfig = typeof apis.$inferSelect;
export type AuthConfig = typeof apis.$inferSelect.auth;
export type DynamicAuth = typeof apis.$inferSelect.auth.dynamic;

// MCP Server Configuration
export type MCPServerConfig = typeof mcpServers.$inferSelect;

export interface ChatContext {
    agents?: AgentConfig[];
    tools?: RunnableTool[];
    apis?: APIConfig[]; // Array of API configurations
    mcpServers?: MCPServerConfig[]; // Array of MCP server configurations
    users?: User[]; // Optional users context
    stream?: boolean;
    activeTaskId?: string;
    callbacks?: ChatCallbacks;
    dbInstance?: any;
    dbConfig?: DatabaseConfig;
}

// Internal processing types
export interface MessageProcessingContext {
    thread: Thread;
    chatHistory: NewMessage[];
    activeTask: Task | null;
    availableAgents: AgentConfig[];
    allTools: RunnableTool[];
    allSystemAgents: AgentConfig[]; // Full list of agents available to tools
}

export interface AgentProcessingResult {
    agent: AgentConfig;
    response?: NewMessage;
    toolResults?: ToolExecutionResult[];
}

export interface ToolExecutionResult {
    tool_call_id: string;
    output?: any;
    error?: any;
}

export interface LLMContextData {
    threadContext: string;
    taskContext: string;
    agentContext: string;
    systemPrompt: string;
}

// Queue processing status
export type QueueStatus = "pending" | "processing" | "completed" | "failed";

// Chat management result
export interface ChatManagementResult {
    queueId: string;
    status: "queued";
    threadId: string;
}


// here we'll define the types for the agent application.

/**
 * agents:
 *  - name: string
 *  - role: string
 *  - capabilities: string[]
 *  - personality: string
 *  - instructions: string
 *  - tools: object[]
 *  - createdAt: date
 *  - updatedAt: date
 */

/**
 * tools:
 *  - name: string
 *  - description: string
 *  - inputSchema: object
 *  - outputSchema: object
 *  - execute: function
 *  - createdAt: date
 *  - updatedAt: date
 */

/**
 * threads:
 *  - id: string
 *  - name: string
 *  - description: string
 *  - participants: string[]
 *  - initialMessage: string
 *  - mode: string (background, immediate)
 *  - status: string (active, inactive)
 *  - summary?: string
 *  - parentThreadId?: string
 *  - createdAt: date
 *  - updatedAt: date
 */

/**
 * tasks:
 *  - id: string
 *  - name: string
 *  - goal: string
 *  - successCriteria: string
 *  - status: string (completed, failed, in progress)
 *  - notes?: string
 *  - createdAt: date
 *  - updatedAt: date
 */

/**
 * tool logs:
 *  - id: string
 *  - toolName: string
 *  - toolInput: string
 *  - toolOutput: string
 *  - threadId: string
 *  - taskId: string
 *  - agentId: string
 *  - status: string (success, error)
 *  - errorMessage?: string
 *  - createdAt: date
 *  - updatedAt: date
 */

