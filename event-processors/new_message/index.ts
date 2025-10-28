
// Import Event Queue
import type { NewEvent, EventProcessor } from "@/interfaces/index.ts";

// Import Tools
import { generateAllApiTools } from "@/event-processors/tool_call/generators/api-generator.ts";
import { generateAllMcpTools } from "@/event-processors/tool_call/generators/mcp-generator.ts";
import { getNativeTools } from "../tool_call/native-tools-registry/index.ts";

// Import Database Operations
import type { Operations } from "@/database/operations/index.ts";

// Import Agent Interfaces
import type {
    Agent,
    Thread,
    NewMessage,
    Tool,
    ChatContext,
    ProcessorDeps,
    Event,
} from "@/interfaces/index.ts";

import type {
    ToolDefinition,
    ChatMessage,
    ProviderConfig,
} from "@/connectors/llm/types.ts";

import type { ToolCallInput } from "@/event-processors/tool_call/index.ts";

// Import Generators
import {
    contextGenerator,
    historyGenerator,
    type LLMContextData
} from "./generators/index.ts";


// Message payload used by USER_MESSAGE / AGENT_MESSAGE inputs to the engine
export interface MessagePayload {
    senderId: string;
    senderType: "user" | "agent" | "tool" | "system";
    content?: string;
    toolCalls?: ToolCallInput[];
    toolCallId?: string;
    metadata?: unknown;
}

export const messageProcessor: EventProcessor<MessagePayload, ProcessorDeps> = {
    shouldProcess: () => true,
    process: async (event: Event, deps: ProcessorDeps) => {
        const { db, thread, context } = deps;
        const ops = db.operations;

        const payload = event.payload as MessagePayload;

        const incomingMsg: NewMessage = {
            threadId: event.threadId,
            senderId: payload.senderId,
            senderType: payload.senderType,
            content: payload.content || "",
            toolCallId: payload.toolCallId,
            toolCalls: payload.toolCalls,
        };

        // Persist incoming message before processing
        ops.createMessage(incomingMsg);

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

            // Emit tool calls as events without executing here
            if (toolCalls && toolCalls.length > 0) {
                toolCalls.forEach((call, i: number) => {
                    const callId = call.id || `${call.function?.name || 'call'}_${i}`;
                    producedEvents.push({
                        threadId: event.threadId,
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
            const ctx = await buildProcessingContext(ops, event.threadId, context, agent.name);

            // Build LLM request
            const llmContext: LLMContextData = contextGenerator(agent, thread, ctx.activeTask, ctx.availableAgents, availableAgents);
            const llmHistory: ChatMessage[] = historyGenerator(ctx.chatHistory, agent);

            // Select tools available to this agent
            const agentTools = agent.allowedTools?.map((key: string) => ctx.allTools.find((t: Tool) => t.key === key)).filter((t: Tool | undefined) => t !== undefined) || [];
            const llmTools: ToolDefinition[] = formatToolsForAI(agentTools);


            const llmMessages: ChatMessage[] = [
                { role: "system", content: llmContext.systemPrompt },
                ...llmHistory
            ];

            producedEvents.push({
                threadId: event.threadId,
                type: "LLM_CALL",
                payload: {
                    agentName: agent.name,
                    agentId: agent.id,
                    agentType: agent.type,
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

const formatToolsForAI = (tools: Tool[]): ToolDefinition[] => {
    return tools.map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.key,
            description: tool.description,
            parameters: tool.inputSchema || {
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

    const nativeToolsArray = Object.values(getNativeTools());
    const userTools = context.tools || [];
    const apiTools = context.apis ? generateAllApiTools(context.apis) : [];
    const mcpTools = context.mcpServers ? await generateAllMcpTools(context.mcpServers) : [];
    const allTools: Tool[] = [...nativeToolsArray, ...userTools, ...apiTools, ...mcpTools];

    return { thread, chatHistory, activeTask, availableAgents, allTools } as {
        thread: Thread;
        chatHistory: NewMessage[];
        activeTask: unknown;
        availableAgents: Agent[];
        allTools: Tool[];
    };
}

function filterAllowedAgents(senderType: MessagePayload["senderType"], senderId: string, targetAgents: Agent[], availableAgents: Agent[]): Agent[] {
    if (senderType !== "agent") return targetAgents;
    const senderAgent = availableAgents.find(a => a.name === senderId);
    if (!senderAgent || !senderAgent.allowedAgents) return targetAgents;
    return targetAgents.filter(agent => senderAgent.allowedAgents!.includes(agent.name));
}

function discoverTargetAgentsForMessage(payload: MessagePayload, thread: Thread, availableAgents: Agent[]): Agent[] {
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
