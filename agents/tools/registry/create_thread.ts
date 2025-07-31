import chatManagement from "../../threads/index.ts";
import { ToolExecutionContext } from "../../Interfaces.ts";

interface CreateThreadParams {
    name: string;
    participants: string[];
    initialMessage?: string;
    mode?: "background" | "immediate";
    description?: string;
    summary?: string;
}

export default {
    key: "create_thread",
    name: "Create Thread",
    description: "Creates a new conversation thread.",
    inputSchema: {
        type: "object",
        properties: {
            name: { type: "string", description: "The name of the thread." },
            participants: { 
                type: "array", 
                items: { type: "string" },
                description: "Array of participant names (agent names or user IDs)." 
            },
            initialMessage: { type: "string", description: "Optional initial message to start the thread." },
            mode: { 
                type: "string", 
                enum: ["background", "immediate"],
                description: "Thread execution mode (default: immediate).",
                default: "immediate"
            },
            description: { type: "string", description: "Optional thread description." },
            summary: { type: "string", description: "Optional thread summary." },
        },
        required: ["name", "participants"],
    },
    execute: async ({ name, participants, initialMessage, mode = "immediate", description, summary }: CreateThreadParams, context?: ToolExecutionContext) => {
        // Create thread with specified participants
        const threadId = crypto.randomUUID();
        
        const initMessage = {
            threadId,
            content: initialMessage || `Started thread: ${name}`,
            threadName: name,
            parentThreadId: context?.threadId,
            senderId: context?.senderId || "system",
            senderType: context?.senderType || "system" as const,
            participants,
        };

        // Create ChatContext with inherited settings from parent
        const chatContext = {
            agents: context?.agents || [],
            tools: context?.tools || [],
            callbacks: context?.callbacks,
            stream: context?.stream,
            activeTaskId: context?.activeTaskId,
            dbInstance: context?.db,
        };

        // Start the thread
        const result = await chatManagement(initMessage, chatContext);

        return {
            threadId,
            name,
            participants,
            mode,
            description,
            summary,
            queueId: result.queueId,
            status: result.status,
        };
    },
}