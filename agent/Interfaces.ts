import {
    agents,
    tools,
    threads,
    tasks,
    messages,
    tool_logs,
    queue,
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

export interface AgentConfig
    extends Omit<
        typeof agents.$inferInsert,
        "id" | "createdAt" | "updatedAt"
    > {
    llmOptions?: ProviderConfig;
    allowedAgents?: string[]; // Array of agent names this agent can communicate with
    allowedTools?: string[]; // Array of tool keys this agent can use
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

// Chat framework initialization types
export interface ChatInitMessage {
    threadId?: string;
    senderId?: string;
    senderType?: "user" | "agent" | "tool" | "system";
    content: string;
    threadName?: string;
    parentThreadId?: string;
    participants?: string[]; // Filter agents available for this conversation
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

// Callback types for chat framework events
export interface ChatCallbacks {
    onToolCalling?: (data: ToolCallingData) => void | Promise<void>;
    onToolCompleted?: (data: ToolCompletedData) => void | Promise<void>;
    onMessageReceived?: (data: MessageReceivedData) => void | Promise<void>;
    onMessageSent?: (data: MessageSentData) => void | Promise<void>;
    onTokenStream?: (data: TokenStreamData) => void | Promise<void>;
    onLLMCompleted?: (data: LLMCompletedData) => void | Promise<void>;
}

// TO DO: ADD MCP SERVERS -> export interface McpServerConfig. Array of MCP Servers Connection Configs

// TO DO: ADD APIs -> export interface ApiConfig. Array of OpenAPI schemas

// Authentication configuration types
export interface ApiKeyAuth {
    type: 'apiKey';
    key: string; // The API key value
    name: string; // Parameter name (e.g., 'X-API-Key', 'api_key')
    in: 'header' | 'query'; // Where to put the API key
}

export interface BearerAuth {
    type: 'bearer';
    token: string; // The bearer token (JWT, OAuth token, etc.)
    scheme?: string; // Optional scheme (default: 'Bearer')
}

export interface BasicAuth {
    type: 'basic';
    username: string;
    password: string;
}

export interface CustomAuth {
    type: 'custom';
    headers?: Record<string, string>; // Custom headers
    queryParams?: Record<string, string>; // Custom query parameters
}

export interface DynamicAuth {
    type: 'dynamic';
    authEndpoint: {
        url: string; // Auth endpoint URL (e.g., '/auth/login', '/oauth/token')
        method?: 'GET' | 'POST' | 'PUT'; // HTTP method (default: POST)
        headers?: Record<string, string>; // Headers for auth request
        body?: any; // Auth request body (credentials, client_id, etc.)
        credentials?: {
            username?: string;
            password?: string;
            client_id?: string;
            client_secret?: string;
            grant_type?: string;
            [key: string]: any; // Additional auth parameters
        };
    };
    tokenExtraction: {
        path: string; // JSONPath to extract token (e.g., 'access_token', 'data.token', 'response.authKey')
        type: 'bearer' | 'apiKey'; // How to use the extracted token
        headerName?: string; // For apiKey type: where to put the token (default: 'Authorization')
        prefix?: string; // Token prefix (e.g., 'Bearer ', 'Token ', default: 'Bearer ' for bearer type)
    };
    refreshConfig?: {
        refreshPath?: string; // JSONPath to refresh token (e.g., 'refresh_token')
        refreshEndpoint?: string; // Endpoint for token refresh
        refreshBeforeExpiry?: number; // Refresh N seconds before expiry (default: 300)
        expiryPath?: string; // JSONPath to token expiry (e.g., 'expires_in', 'exp')
    };
    cache?: {
        enabled?: boolean; // Whether to cache tokens (default: true)
        duration?: number; // Cache duration in seconds (default: 3600)
    };
}

export type AuthConfig = ApiKeyAuth | BearerAuth | BasicAuth | CustomAuth | DynamicAuth;

// API Configuration for OpenAPI schema tools
export interface APIConfig {
    name: string;
    description?: string;
    openApiSchema: any; // OpenAPI 3.0+ JSON schema
    baseUrl?: string; // Base URL to override the one in the schema
    headers?: Record<string, string>; // Default headers for all requests (deprecated in favor of auth)
    auth?: AuthConfig; // Authentication configuration
    timeout?: number; // Request timeout in seconds
}

// MCP Server Configuration
export interface MCPServerConfig {
    name: string;
    description?: string;
    transport: {
        type: "stdio" | "sse" | "websocket";
        command?: string; // For stdio transport
        args?: string[]; // For stdio transport
        url?: string; // For sse/websocket transport
    };
    capabilities?: string[]; // Optional capabilities filter
    env?: Record<string, string>; // Environment variables for stdio
}

export interface ChatContext {
    agents?: AgentConfig[];
    tools?: RunnableTool[];
    apis?: APIConfig[]; // Array of API configurations
    mcpServers?: MCPServerConfig[]; // Array of MCP server configurations
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

