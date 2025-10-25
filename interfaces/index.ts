import type {
    Agent, NewAgent,
    API, NewAPI,
    MCPServer, NewMCPServer,
    Message, NewMessage,
    Queue, NewQueue,
    Event, NewEvent,
    Task, NewTask,
    Thread, NewThread,
    Tool, NewTool,
    User, NewUser,
} from "@/database/schemas/index.ts";

export type {
    Agent, NewAgent,
    API, NewAPI,
    MCPServer, NewMCPServer,
    Message, NewMessage,
    Queue, NewQueue,
    Event, NewEvent,
    Task, NewTask,
    Thread, NewThread,
    Tool, NewTool,
    User, NewUser,
}
 
import type {
    DatabaseConfig,
    Operations,
    DbInstance,
} from "@/database/index.ts";

export type {
    DatabaseConfig,
    Operations,
    DbInstance
}

export type {
    EventProcessor,
    ProcessorDeps,
    MessagePayload,
    ToolCallPayload,
    ToolResultPayload,
    LLMCallPayload,
    LLMResultPayload,
} from "@/event-processors/index.ts";

// Chat context interface
export interface ChatContext {
    agents?: Agent[];
    tools?: Tool[];
    apis?: API[]; // Array of API configurations
    mcpServers?: MCPServer[]; // Array of MCP server configurations
    users?: User[]; // Optional users context
    stream?: boolean;
    activeTaskId?: string;
    callbacks?: ChatCallbacks;
    dbInstance?: DbInstance;
    dbConfig?: DatabaseConfig;
}

// Callback types that can return values for interception
export interface ChatCallbacks {
    onContentStream?: (data: ContentStreamData) => void | Promise<void> | ContentStreamData;
    onEvent?: (event: Event) => Promise<{ producedEvents?: NewEvent[] } | void> | { producedEvents?: NewEvent[] } | void;
}

export interface ContentStreamData {
    threadId: string;
    agentName: string;
    token: string;
    isComplete: boolean;
}

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
