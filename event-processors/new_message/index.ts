
// Import Event Queue
import type { NewEvent, EventProcessor } from "@/interfaces/index.ts";

// Import Tools
import { generateAllApiTools } from "@/event-processors/tool_call/generators/api-generator.ts";
import { generateAllMcpTools } from "@/event-processors/tool_call/generators/mcp-generator.ts";
import { getNativeTools } from "@/event-processors/tool_call/native-tools-registry/index.ts";

// Import Agent Interfaces
import type {
    Agent,
    Thread,
    NewMessage,
    ChatContext,
    ProcessorDeps,
    Event,
    ExecutableTool,
    ToolExecutor,
} from "@/interfaces/index.ts";

type Operations = ProcessorDeps["db"]["ops"];

import type {
    ToolDefinition,
    ChatMessage,
    ProviderConfig,
} from "@/connectors/llm/types.ts";

import type { NewMessageEventPayload } from "@/database/schemas/index.ts";

// Import Generators
import {
    contextGenerator,
    historyGenerator,
    type LLMContextData
} from "./generators/index.ts";



function toExecutableTool(tool: unknown): ExecutableTool | null {
    if (!tool || typeof tool !== "object") return null;
    const maybe = tool as Partial<ExecutableTool>;

    const executeSource = maybe.execute;
    if (typeof executeSource !== "function") return null;

    const executor: ToolExecutor = (args, context) =>
        executeSource.call(tool, args, context) as Promise<unknown> | unknown;

    const key = maybe.key;
    const name = maybe.name;
    const description = maybe.description;
    if (typeof key !== "string" || typeof name !== "string" || typeof description !== "string") {
        return null;
    }

    const toDate = (value: unknown): Date => {
        if (value instanceof Date) return value;
        if (typeof value === "string" || typeof value === "number") {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return new Date();
    };

    return {
        id: typeof maybe.id === "string"
            ? maybe.id
            : crypto.randomUUID(),
        key,
        name,
        description,
        externalId: typeof maybe.externalId === "string" ? maybe.externalId : null,
        metadata: (maybe.metadata && typeof maybe.metadata === "object")
            ? maybe.metadata
            : null,
        createdAt: toDate(maybe.createdAt),
        updatedAt: toDate(maybe.updatedAt),
        inputSchema: maybe.inputSchema ?? null,
        outputSchema: maybe.outputSchema ?? null,
        execute: executor,
    };
}

function assertMessagePayload(payload: unknown): asserts payload is NewMessageEventPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid message payload");
    }
    const value = payload as Record<string, unknown>;
    if (typeof value.senderId !== "string" || typeof value.senderType !== "string") {
        throw new Error("Invalid message payload");
    }
    const metadata = (value as { metadata?: unknown }).metadata;
    if (metadata != null && typeof metadata !== "object") {
        throw new Error("Invalid message payload metadata");
    }
}

export const messageProcessor: EventProcessor<NewMessageEventPayload, ProcessorDeps> = {
    shouldProcess: () => true,
    process: async (event: Event, deps: ProcessorDeps) => {
        const { db, thread, context } = deps;
        const ops = db.ops;

        assertMessagePayload(event.payload);
        const payload = event.payload;

        const threadId = typeof event.threadId === "string"
            ? event.threadId
            : (() => { throw new Error("Invalid thread id for message event"); })();

        const messageMetadata = payload.metadata !== null && typeof payload.metadata === "object"
            ? payload.metadata as Record<string, unknown>
            : null;

        const incomingMsg = {
            id: crypto.randomUUID(),
            threadId,
            senderId: payload.senderId,
            senderType: payload.senderType,
            content: (payload.content ?? ""),
            toolCallId: (payload.toolCallId ?? null),
            toolCalls: (payload.toolCalls ?? null),
            metadata: messageMetadata,
        };

        // Persist incoming message before processing
        await ops.createMessage(incomingMsg);

        // Resolve targets
        const availableAgents = context.agents || [];
        const targets = discoverTargetAgentsForMessage(payload, thread, availableAgents);

        const producedEvents: NewEvent[] = [];

        // Assign descending priorities per target to enforce strict serial-per-target
        const basePriority = 1000;
        // If this event already has a priority (continuation of a chain), keep it

        for (let idx = 0; idx < targets.length; idx++) {

            const chainPriority = typeof event.priority === 'number' ? (event.priority as number) : (basePriority - idx);

            const agent = targets[idx];

            const toolCalls = payload.toolCalls;

            // Emit tool calls as events
            if (toolCalls && toolCalls.length > 0) {
                toolCalls.forEach((call, i: number) => {
                    if (!call?.function) return;
                    const callId = call.id || `${call.function?.name || 'call'}_${i}`;
                    producedEvents.push({
                        threadId,
                        type: "TOOL_CALL",
                        payload: {
                            agentName: agent.name,
                            senderId: agent.id,
                            senderType: "agent",
                            call: {
                                id: callId,
                                function: {
                                    name: call.function.name,
                                    arguments: call.function.arguments,
                                }
                            }
                        },
                        parentEventId: event.id,
                        traceId: event.traceId,
                        priority: chainPriority
                    });
                });
                continue;
            }

            /** If the message is not a tool call, we need to add the message to the LLM context */


            // Build processing context
            const ctx = await buildProcessingContext(ops, threadId, context, agent.name);

            // Build LLM request
            const llmContext: LLMContextData = contextGenerator(agent, thread, ctx.activeTask, ctx.availableAgents, availableAgents, ctx.userMetadata);
            const llmHistory: ChatMessage[] = historyGenerator(ctx.chatHistory, agent);

            // Select tools available to this agent
            const agentTools = agent.allowedTools
                ?.map((key: string) => ctx.allTools.find((t) => t.key === key))
                .filter((t): t is ExecutableTool => Boolean(t)) || [];
            const llmTools: ToolDefinition[] = formatToolsForAI(agentTools);


            const systemPrompt = typeof llmContext.systemPrompt === "string"
                ? llmContext.systemPrompt
                : JSON.stringify(llmContext.systemPrompt ?? {});

            const llmMessages: ChatMessage[] = [
                { role: "system", content: systemPrompt },
                ...llmHistory
            ];

            producedEvents.push({
                threadId,
                type: "LLM_CALL",
                payload: {
                    agentName: agent.name,
                    agentId: agent.id,
                    messages: llmMessages,
                    tools: llmTools,
                    config: agent.llmOptions as ProviderConfig,
                },
                parentEventId: event.id,
                traceId: event.traceId,
                priority: chainPriority,
            });

        }

        return { producedEvents };
    }
};

const formatToolsForAI = (tools: ExecutableTool[]): ToolDefinition[] => {
    return tools.map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.key,
            description: tool.description,
            parameters: tool.inputSchema && typeof tool.inputSchema === "object"
                ? {
                    type: "object" as const,
                    properties: (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
                    required: Array.isArray((tool.inputSchema as { required?: string[] }).required)
                        ? (tool.inputSchema as { required?: string[] }).required
                        : undefined,
                }
                : {
                    type: "object" as const,
                    properties: {},
                },
        },
    }));
};


async function buildProcessingContext(ops: Operations, threadId: string, context: ChatContext, senderIdForHistory: string) {
    const thread: Thread | undefined = await ops.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);

    const chatHistory = await ops.getMessageHistory(threadId, senderIdForHistory);

    const activeTask = context.activeTaskId ? (await ops.getTaskById(context.activeTaskId)) || null : null;

    const availableAgents = context.agents || [];
    if (availableAgents.length === 0) {
        throw new Error("No agents provided in context for this session");
    }

    const nativeToolsArray = Object.values(getNativeTools())
        .map(toExecutableTool)
        .filter((tool): tool is ExecutableTool => Boolean(tool));
    const userTools =
        (context.tools || [])
            .map(toExecutableTool)
            .filter((tool): tool is ExecutableTool => Boolean(tool));
    const apiTools = context.apis ? generateAllApiTools(context.apis) : [];
    const mcpTools = context.mcpServers ? await generateAllMcpTools(context.mcpServers) : [];
    const allTools: ExecutableTool[] = [...nativeToolsArray, ...userTools, ...apiTools, ...mcpTools];

    let userMetadata = context.userMetadata;
    const threadMetadata = thread.metadata && typeof thread.metadata === "object"
        ? (thread.metadata as Record<string, unknown>)
        : undefined;

    if (!userMetadata && threadMetadata) {
        const stored = threadMetadata.userContext;
        if (stored && typeof stored === "object") {
            userMetadata = stored as Record<string, unknown>;
        }
    }

    if (!userMetadata && threadMetadata?.userExternalId) {
        const externalId = threadMetadata.userExternalId as string;
        try {
            const user = await ops.getUserByExternalId(externalId);
            if (user?.metadata && typeof user.metadata === "object") {
                userMetadata = user.metadata as Record<string, unknown>;
            }
        } catch (error) {
            console.warn(`buildProcessingContext: failed to load user metadata for ${externalId}`, error);
        }
    }

    if (userMetadata && !context.userMetadata) {
        context.userMetadata = userMetadata;
    }

    return {
        thread,
        chatHistory,
        activeTask,
        availableAgents,
        allTools,
        userMetadata,
    } as {
        thread: Thread;
        chatHistory: NewMessage[];
        activeTask: unknown;
        availableAgents: Agent[];
        allTools: ExecutableTool[];
        userMetadata?: Record<string, unknown>;
    };
}

function filterAllowedAgents(senderType: NewMessageEventPayload["senderType"], senderId: string, targetAgents: Agent[], availableAgents: Agent[]): Agent[] {
    if (senderType !== "agent") return targetAgents;
    const senderAgent = availableAgents.find(a => a.name === senderId);
    if (!senderAgent || !senderAgent.allowedAgents) return targetAgents;
    return targetAgents.filter(agent => senderAgent.allowedAgents!.includes(agent.name));
}

function discoverTargetAgentsForMessage(payload: NewMessageEventPayload, thread: Thread, availableAgents: Agent[]): Agent[] {
    // Tool messages route back to the requesting agent by senderId
    if (
        (payload.senderType === "tool" || (payload.toolCalls && payload.toolCalls?.length > 0)) &&
        payload.senderId
    ) {
        const agent = availableAgents.find(a => a.id === payload.senderId);
        return agent ? [agent] : [];
    }

    // Mentions (preserve mention order)
    const mentions = payload.content?.match(/(?<!\w)@([\w](?:[\w.-]*[\w])?)/g);
    if (mentions && mentions.length > 0) {
        const names = mentions.map((m: string) => m.substring(1));
        // Build in the order mentioned, unique by name
        const seen = new Set<string>();
        const orderedMentioned: Agent[] = [];
        for (const name of names) {
            if (seen.has(name)) continue;
            const agent = availableAgents.find(a => a.name === name);
            if (agent) {
                orderedMentioned.push(agent);
                seen.add(name);
            }
        }
        const allowedMentionedAgents = filterAllowedAgents(payload.senderType, payload.senderId, orderedMentioned, availableAgents);
        if (allowedMentionedAgents.length > 0) {
            return allowedMentionedAgents;
        }
        // Otherwise ignore unrecognized/disallowed mentions and continue to fallback logic below
    }

    // Default two-party fallback
    if (thread.participants && thread.participants.length === 2) {
        const otherParticipant: string | undefined = thread.participants.find((p: string) => p !== payload.senderId);
        if (otherParticipant) {
            const otherAgent = availableAgents.find(a => a.name === otherParticipant);
            if (otherAgent) return [otherAgent];
        }
    }

    // Otherwise: no implicit target
    return [];
}
