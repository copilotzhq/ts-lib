import { runAI } from "../../ai/index.ts";
import { createOperations as createAgentOperations, type Operations } from "../database/operations.ts";
import { getNativeTools } from "../tools/registry/index.ts";
import { generateAllApiTools } from "../tools/api-generator.ts";
import { generateAllMcpTools } from "../tools/mcp-generator.ts";
import { processToolCalls } from "../tools/processing.ts";
import { startEventWorker as startGenericEventWorker, enqueueEvent as enqueueGenericEvent, type EventProcessor as GenericEventProcessor, type QueueEvent as GenericQueueEvent, type NewQueueEvent as GenericNewQueueEvent } from "../../event-queue/index.ts";
import type {
    AgentConfig,
    ChatContext,
    LLMContextData,
    NewMessage,
    ContentStreamData,
    ToolCallStreamData,
    RunnableTool,
    Thread,
    ToolExecutionResult
} from "../Interfaces.ts";
import type { ToolDefinition, ChatMessage, ToolCall } from "../../ai/llm/types.ts";
import { aiProcessors } from "../../ai/index.ts";

// Event types for the new event-driven queue engine
export type EventType =
    | "MESSAGE"
    | "TOOL_CALL"
    | "TOOL_RESULT"
    | "SYSTEM";

// Centralized queue types aliased for agent-specific event type
export type QueueEvent<T = unknown> = GenericQueueEvent<T> & { type: EventType };
export type NewQueueEvent<T = unknown> = GenericNewQueueEvent<T> & { type: EventType };

// Message payload used by USER_MESSAGE / AGENT_MESSAGE inputs to the engine
export interface MessagePayload {
    senderId: string;
    senderType: "user" | "agent" | "tool" | "system";
    content?: string;
    toolCalls?: unknown[];
    toolCallId?: string;
    metadata?: unknown;
}

export interface ToolCallPayload {
    agentName: string; // agent that requested the tool
    call: { id?: string; function: { name: string; arguments: string } };
}

export interface ToolResultPayload {
    agentName: string; // agent that requested the tool
    callId: string;
    output?: unknown;
    error?: unknown;
    // Optional convenience content (already formatted) for logs/messages
    content?: string;
}

export interface ProcessResult {
    producedEvents: NewQueueEvent[];
}

interface ProcessorDeps {
    ops: Operations;
    db: unknown;
    thread: Thread;
    context: ChatContext;
}

type AgentsEventProcessor<TPayload = unknown> = GenericEventProcessor<TPayload, ProcessorDeps>;

// Utilities reused from legacy engine (minimized/duplicated to avoid refactors)
const escapeRegex = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatToolsForAI = (tools: RunnableTool[]): ToolDefinition[] => {
    return tools.map((tool) => ({
        type: "function" as const,
        function: {
            name: tool.key,
            description: tool.description,
            parameters: tool.inputSchema &&
                typeof tool.inputSchema === 'object' &&
                'type' in tool.inputSchema &&
                'properties' in tool.inputSchema
                ? tool.inputSchema as { type: 'object'; properties: Record<string, unknown>; required?: string[]; }
                : {
                    type: "object" as const,
                    properties: {} as Record<string, unknown>
                },
        },
    }));
};

function buildLLMContext(
    agent: AgentConfig,
    thread: Thread,
    activeTask: unknown,
    availableAgents: AgentConfig[],
    allSystemAgents: AgentConfig[]
): LLMContextData {
    const participantInfo = thread.participants?.map((p: string) => {
        const agentInfo = availableAgents.find((a: AgentConfig) => a.name === p);
        return `name: ${p} | role: ${agentInfo?.role || "N/A"} | description: ${agentInfo?.description || "N/A"}`;
    }).join("\n- ") || "N/A";

    const otherAvailableAgents = allSystemAgents.filter(a =>
        a.name !== agent.name &&
        !(thread.participants?.includes(a.name))
    );

    const availableAgentsInfo = otherAvailableAgents.length > 0 ?
        otherAvailableAgents.map(a =>
            `name: ${a.name} | role: ${a.role} | description: ${a.description || "N/A"}`
        ).join("\n- ") : "None";

    const threadContext = [
        "## THREAD CONTEXT",
        `Current thread: "${thread.name}".`,
        ...(thread?.participants && thread.participants.length > 1 ? [
            `Participants in this thread:`,
            `- ${participantInfo}`,
            "",
            "IMPORTANT: In the conversation history, messages from other participants are prefixed with [SpeakerName]: to help you understand who said what. Your own previous messages appear without prefixes.",
            "",
            `If you expect an answer from a specific participant, use mention with @<name>, for example: @${thread.participants?.find((p: string) => p !== agent.name)} (otherwise, the participant will not be able to see your message).`
        ] : []),
        ...(otherAvailableAgents.length > 0 ? [
            "",
            "Other available agents (not in current thread):",
            `- ${availableAgentsInfo}`,
            "",
            "NOTE: You can communicate with these agents using tools like 'ask_question' for quick queries or 'create_thread' for longer discussions."
        ] : [])
    ].filter(Boolean).join("\n");

    let taskContext = "";
    if (activeTask && typeof activeTask === 'object') {
        const at = activeTask as { name?: string; goal?: string; status?: string };
        if (at.name || at.goal || at.status) {
            taskContext = [
                "## TASK CONTEXT",
                `Current task: ${at.name ?? "N/A"}`,
                `Goal: ${at.goal ?? "N/A"}`,
                `Status: ${at.status ?? "N/A"}`
            ].join("\n");
        }
    }

    const agentContext = [
        "## IDENTITY",
        `You are ${agent.name}`,
        `Your role is: ${agent.role}`,
        `Personality: ${agent.personality}`,
        `Your instructions are: ${agent.instructions}`
    ].join("\n");

    const currentDate = new Date().toLocaleString();
    const dateContext = `Current date and time: ${currentDate}`;

    const systemPrompt = [threadContext, taskContext, agentContext, dateContext]
        .filter(Boolean)
        .join("\n\n");

    return {
        threadContext,
        taskContext,
        agentContext,
        systemPrompt,
    };
}

function buildLLMHistory(chatHistory: NewMessage[], currentAgent: AgentConfig): ChatMessage[] {
    return chatHistory.map((msg, idx) => {
        const role = msg.senderType === "agent"
            ? (msg.senderId === currentAgent.name ? "assistant" : "user")
            : msg.senderType;

        let content = msg.content || "";

        if (msg.senderType === "agent" && msg.senderId !== currentAgent.name) {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "user" && msg.senderId !== "user") {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "tool") {
            content = `[Tool Result]: ${content}`;
        }

        // Preserve tool calls in metadata to let ai/llm rehydrate <function_calls>
        const metaCandidate = msg as unknown as { toolCalls?: Array<{ id?: string; function: { name: string; arguments: string } }> };
        let metadata: ChatMessage["metadata"] = undefined;
        if (metaCandidate.toolCalls && Array.isArray(metaCandidate.toolCalls) && metaCandidate.toolCalls.length > 0) {
            const normalized: ToolCall[] = metaCandidate.toolCalls.map((call, i) => ({
                id: call.id || `${call.function?.name || 'call'}_${i}`,
                function: {
                    name: call.function.name,
                    arguments: call.function.arguments,
                }
            }));
            metadata = { toolCalls: normalized } as ChatMessage["metadata"];
        }

        return {
            content,
            role: role,
            tool_call_id: (msg as unknown as { toolCallId?: string }).toolCallId || undefined,
            metadata,
        };
    });
}

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
    const allTools: RunnableTool[] = [...nativeToolsArray, ...userTools, ...apiTools, ...mcpTools];

    return { thread, chatHistory, activeTask, availableAgents, allTools } as {
        thread: Thread;
        chatHistory: NewMessage[];
        activeTask: unknown;
        availableAgents: AgentConfig[];
        allTools: RunnableTool[];
    };
}

function filterAllowedAgents(senderType: MessagePayload["senderType"], senderId: string, targetAgents: AgentConfig[], availableAgents: AgentConfig[]): AgentConfig[] {
    if (senderType !== "agent") return targetAgents;
    const senderAgent = availableAgents.find(a => a.name === senderId);
    if (!senderAgent || !senderAgent.allowedAgents) return targetAgents;
    return targetAgents.filter(agent => senderAgent.allowedAgents!.includes(agent.name));
}

function discoverTargetAgentsForMessage(payload: MessagePayload, thread: Thread, availableAgents: AgentConfig[]): AgentConfig[] {
    // Tool messages route back to the requesting agent by senderId
    if (payload.senderType === "tool" && payload.senderId) {
        const agent = availableAgents.find(a => a.name === payload.senderId);
        return agent ? [agent] : [];
    }

    // Mentions
    const mentions = payload.content?.match(/@(\w+)/g);
    if (mentions && mentions.length > 0) {
        const names = mentions.map((m: string) => m.substring(1));
        const mentionedAgents = availableAgents.filter(a => names.includes(a.name));
        return filterAllowedAgents(payload.senderType, payload.senderId, mentionedAgents, availableAgents);
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

// Processors
const messageProcessor: AgentsEventProcessor<MessagePayload> = {
    shouldProcess: () => true,
    process: async (event, deps) => {
        const { ops, db: _db, thread, context } = deps;
        const payload = event.payload;

        // Persist incoming message if it has content
        if (payload.content && payload.content.length > 0) {
            const incomingMsg: NewMessage = {
                threadId: event.threadId,
                senderId: payload.senderId,
                senderType: payload.senderType,
                content: payload.content,
                toolCallId: payload.toolCallId,
                toolCalls: payload.toolCalls,
            };
            await ops.createMessage(incomingMsg);
        }

        // Resolve targets
        const availableAgents = context.agents || [];
        const targets = discoverTargetAgentsForMessage(payload, thread, availableAgents);

        const producedEvents: NewQueueEvent[] = [];

        for (const agent of targets) {
            // Build processing context
            const ctx = await buildProcessingContext(ops, event.threadId, context, agent.name);

            // Build LLM request
            const llmContext: LLMContextData = buildLLMContext(agent, thread, ctx.activeTask, ctx.availableAgents, availableAgents);
            const llmHistory: ChatMessage[] = buildLLMHistory(ctx.chatHistory, agent);

            // Select tools available to this agent
            const agentTools = agent.allowedTools?.map(key => ctx.allTools.find(t => t.key === key)).filter((t): t is RunnableTool => t !== undefined) || [];
            const llmTools: ToolDefinition[] = formatToolsForAI(agentTools);

            // Streaming callback: ai/llm filters out <function_calls> already.
            const streamCallback = (context.stream && (context.callbacks?.onTokenStream || context.callbacks?.onContentStream))
                ? (token: string) => {
                    if (context.callbacks?.onTokenStream) {
                        context.callbacks.onTokenStream({
                            threadId: event.threadId,
                            agentName: agent.name,
                            token,
                            isComplete: false,
                        });
                    }
                    if (context.callbacks?.onContentStream) {
                        context.callbacks.onContentStream({
                            threadId: event.threadId,
                            agentName: agent.name,
                            token,
                            isComplete: false,
                        } as ContentStreamData);
                    }
                }
                : undefined;

            const aiRun = await runAI(
                { db: deps.db as unknown, threadId: event.threadId, },
                {
                    type: 'llm',
                    messages: [
                        { role: "system", content: llmContext.systemPrompt },
                        ...llmHistory
                    ],
                    tools: llmTools,
                    config: agent.llmOptions as unknown,
                    stream: streamCallback,
                } as unknown as any
            );
            const llmResponse = (aiRun.result || {}) as unknown as { success?: boolean; answer?: string; toolCalls?: Array<{ id?: string; function: { name: string; arguments: string } }>; };

            // finalize stream
            if (streamCallback) {
                if (context.callbacks?.onTokenStream) {
                    context.callbacks.onTokenStream({
                        threadId: event.threadId,
                        agentName: agent.name,
                        token: "",
                        isComplete: true,
                    });
                }
                if (context.callbacks?.onContentStream) {
                    context.callbacks.onContentStream({
                        threadId: event.threadId,
                        agentName: agent.name,
                        token: "",
                        isComplete: true,
                    } as ContentStreamData);
                }
            }

            if (!llmResponse.success) {
                continue;
            }

            // Clean response
            let answer: string | undefined = ("answer" in llmResponse) ? (llmResponse as unknown as { answer?: string }).answer : undefined;
            const toolCalls: Array<{ id?: string; function: { name: string; arguments: string } }> | undefined = ("toolCalls" in llmResponse) ? (llmResponse as unknown as { toolCalls?: Array<{ id?: string; function: { name: string; arguments: string } }> }).toolCalls : undefined;

            if (!answer && !toolCalls) {
                continue;
            }

            if (answer) {
                const selfPrefixPattern = new RegExp(`^\\[${escapeRegex(agent.name)}\\]:\\s*`, 'i');
                answer = answer.replace(selfPrefixPattern, '');
                const selfMentionPattern = new RegExp(`^@${escapeRegex(agent.name)}:\\s*`, 'i');
                answer = answer.replace(selfMentionPattern, '');

                // Persist agent message
                await ops.createMessage({
                    threadId: event.threadId,
                    senderId: agent.name,
                    senderType: "agent",
                    content: answer,
                    toolCalls: toolCalls,
                });
            }

            // Emit tool calls as events without executing here
            if (toolCalls && toolCalls.length > 0) {
                toolCalls.forEach((call, i: number) => {
                    const callId = call.id || `${call.function?.name || 'call'}_${i}`;
                    producedEvents.push({
                        threadId: event.threadId,
                        type: "TOOL_CALL",
                        payload: {
                            agentName: agent.name,
                            call: {
                                id: callId,
                                function: {
                                    name: call.function.name,
                                    arguments: call.function.arguments,
                                }
                            }
                        } as ToolCallPayload,
                        parentEventId: event.id,
                        traceId: event.traceId,
                    });
                });
            }

            // Always enqueue an AGENT_MESSAGE for the agent answer. Routing is computed when this event is processed.
            if (answer) {
                producedEvents.push({
                    threadId: event.threadId,
                    type: "MESSAGE",
                    payload: {
                        senderId: agent.name,
                        senderType: "agent",
                        content: answer,
                    } as MessagePayload,
                    parentEventId: event.id,
                    traceId: event.traceId,
                });
            }
        }

        return { producedEvents };
    }
};

const toolCallProcessor: AgentsEventProcessor<ToolCallPayload> = {
    shouldProcess: () => true,
    process: async (event, deps) => {
        const { ops, db, thread: _thread, context } = deps;
        const payload = event.payload;

        const availableAgents = context.agents || [];
        const agent = availableAgents.find(a => a.name === payload.agentName);
        if (!agent) return { producedEvents: [] };

        // Build tools
        const nativeToolsArray = Object.values(getNativeTools());
        const userTools = context.tools || [];
        const apiTools = context.apis ? generateAllApiTools(context.apis) : [];
        const mcpTools = context.mcpServers ? await generateAllMcpTools(context.mcpServers) : [];
        const allTools: RunnableTool[] = [...nativeToolsArray, ...userTools, ...apiTools, ...mcpTools];

        const agentTools = agent.allowedTools?.map(key => allTools.find(t => t.key === key)).filter((t): t is RunnableTool => t !== undefined) || [];

        const results: ToolExecutionResult[] = await processToolCalls(
            [payload.call],
            agentTools,
            {
                ...context,
                senderId: agent.name,
                senderType: "agent",
                threadId: event.threadId,
                agents: availableAgents,
                tools: allTools,
                db,
            }
        );

        // Persist logs and a tool result message
        const result = results[0];
        const call = payload.call;
        const toolName = call.function.name;
        // const parseInput = (input: unknown): unknown => {
        //     if (typeof input === 'string') { try { return JSON.parse(input); } catch { return input; } }
        //     return input;
        // };

        // const logEntry: NewToolLog = {
        //     threadId: event.threadId,
        //     agentId: null as unknown as string | undefined,
        //     taskId: (context.activeTaskId as unknown as string | undefined) || undefined,
        //     toolName,
        //     toolInput: parseInput(call.function.arguments) as unknown,
        //     toolOutput: result.output as unknown,
        //     status: result.error ? "error" : "success",
        //     errorMessage: result.error ? String(result.error) : undefined,
        //     metadata: undefined as unknown as Record<string, unknown> | undefined,
        // };
        // await ops.createToolLogs([logEntry]);

        // Emit TOOL_RESULT event
        const producedEvents: NewQueueEvent[] = [
            {
                threadId: event.threadId,
                type: "TOOL_RESULT",
                payload: {
                    agentName: agent.name,
                    callId: payload.call.id || toolName,
                    output: result.output,
                    error: result.error,
                } as ToolResultPayload,
                parentEventId: event.id,
                traceId: event.traceId,
            }
        ];

        return { producedEvents };
    }
};

const toolResultProcessor: AgentsEventProcessor<ToolResultPayload> = {
    shouldProcess: () => true,
    process: async (event, deps) => {
        const { ops, thread: _thread } = deps;
        // Schedule a follow-up message event to let the agent continue after tool result
        const payload = event.payload;
        const output = payload.output;
        const error = payload.error;

        let content: string;
        if (error) {
            content = `tool error: ${String(error)}\n\nPlease review the error above and try again with the correct format.`;
        } else if (output) {
            content = typeof output === 'string' ? `tool output: ${output}` : `tool output: ${JSON.stringify(output)}`;
        } else {
            content = `tool completed: No output returned`;
        }

        // Persist tool result message (from the tool, attributed to the agent for routing)
        await ops.createMessage({
            threadId: event.threadId,
            senderId: payload.agentName,
            senderType: "tool",
            content,
            toolCallId: payload.callId,
        });

        const producedEvents: NewQueueEvent[] = [
            {
                threadId: event.threadId,
                type: "MESSAGE", // Trigger processing loop; the message will be routed back to the agent via senderType: tool
                payload: {
                    senderId: payload.agentName,
                    senderType: "tool",
                    content: content,
                } as MessagePayload,
                parentEventId: event.id,
                traceId: event.traceId,
            }
        ];
        return { producedEvents };
    }
};

// Processor registry
const processors: Record<EventType, AgentsEventProcessor<any>> = {
    ...aiProcessors,
    MESSAGE: messageProcessor as AgentsEventProcessor<MessagePayload>,
    TOOL_CALL: toolCallProcessor as AgentsEventProcessor<ToolCallPayload>,
    TOOL_RESULT: toolResultProcessor as AgentsEventProcessor<ToolResultPayload>,
    SYSTEM: {
        shouldProcess: () => true,
        process: () => Promise.resolve({ producedEvents: [] as NewQueueEvent[] })
    }
};

// Public API
export async function enqueueEvent(db: unknown, event: NewQueueEvent): Promise<void> {
    await enqueueGenericEvent(db, event as any);
}

export async function startThreadEventWorker(
    db: unknown,
    threadId: string,
    context: ChatContext
): Promise<void> {
    await startGenericEventWorker<ProcessorDeps>(
        db,
        threadId,
        { callbacks: { onEvent: (context.callbacks as any)?.onEvent as any } },
        processors as any,
        async (_queueOps, event) => {
            const agentOps = createAgentOperations(db);
            const thread = await agentOps.getThreadById(event.threadId);
            if (!thread) throw new Error(`Thread not found: ${event.threadId}`);
            return { ops: agentOps, db, thread, context } as ProcessorDeps;
        }
    );
}

// Convenience: start by enqueuing an initial user message
export async function createThreadWithEventEngine(
    db: any,
    initial: { threadId: string; content: string; senderId?: string; senderType?: MessagePayload["senderType"]; },
    context: ChatContext
): Promise<void> {
    const senderId = initial.senderId || "user";
    const senderType = initial.senderType || "user";

    await enqueueEvent(db, {
        threadId: initial.threadId,
        type: "MESSAGE",
        payload: {
            senderId,
            senderType,
            content: initial.content,
        } as MessagePayload,
    });

    await startThreadEventWorker(db, initial.threadId, context);
}


