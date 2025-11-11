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
    MessagePayload,
    ToolCallEventPayload,
    LlmCallEventPayload,
    TokenEventPayload,
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
    MessagePayload,
    ToolCallEventPayload,
    LlmCallEventPayload,
    TokenEventPayload,
}
 
import type {
    DatabaseConfig,
    DbInstance,
    CopilotzDb,
} from "@/database/index.ts";

export type {
    DatabaseConfig,
    DbInstance,
    CopilotzDb
}

export type {
    EventProcessor,
    ProcessorDeps,
    ToolCallPayload,
    ToolResultPayload,
    ToolExecutionContext,
    LLMCallPayload,
    LLMResultPayload,
    ExecutableTool,
    ToolExecutor,
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
    dbInstance?: CopilotzDb;
    dbConfig?: DatabaseConfig;
    threadMetadata?: Record<string, unknown>;
    queueTTL?: number;
    userMetadata?: Record<string, unknown>;
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

// Narrowing helpers for better DX on Event payloads
type TokenPayload = ContentStreamData & { [x: string]: unknown };
export type TokenEvent = Event & { type: "TOKEN"; payload: TokenPayload };
export function isTokenEvent(event: Event): event is TokenEvent {
    return event?.type === "TOKEN";
}
