import { chat } from "../../ai/index.ts";
import { createOperations, type Operations } from "../database/operations.ts";
import { getNativeTools } from "../tools/registry/index.ts";
import { generateAllApiTools } from "../tools/api-generator.ts";
import { generateAllMcpTools } from "../tools/mcp-generator.ts";
import { processToolCalls } from "../tools/processing.ts";
import type {
    AgentConfig,
    ChatContext,
    LLMContextData,
    NewMessage,
    ContentStreamData,
    ToolCallStreamData,
    NewToolLog,
    RunnableTool,
    Thread,
    ToolExecutionResult
} from "../Interfaces.ts";
import type { ToolDefinition, ChatMessage, ToolCall } from "../../ai/llm/types.ts";

// Event types for the new event-driven queue engine
export type EventType =
    | "USER_MESSAGE"
    | "AGENT_MESSAGE"
    | "TOOL_CALL"
    | "TOOL_RESULT"
    | "SYSTEM";

export interface QueueEvent<T = unknown> {
    id?: string;
    threadId: string;
    type: EventType;
    payload: T;
    parentEventId?: string;
    traceId?: string;
    priority?: number;
}

export type NewQueueEvent<T = unknown> = Omit<QueueEvent<T>, "id">;

// Internal envelope marker so we can co-exist with legacy queue items if needed
interface EventEnvelope {
    _kind: "event";
    event: QueueEvent<unknown>;
}

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

interface EventProcessor<TPayload = unknown> {
    shouldProcess: (event: QueueEvent<TPayload>, deps: ProcessorDeps) => boolean | Promise<boolean>;
    process: (event: QueueEvent<TPayload>, deps: ProcessorDeps) => Promise<ProcessResult>;
}

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
const messageProcessor: EventProcessor<MessagePayload> = {
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

            const llmResponse = await chat({
                messages: [
                    { role: "system", content: llmContext.systemPrompt },
                    ...llmHistory
                ],
                tools: llmTools,
                config: agent.llmOptions,
                stream: streamCallback,
            });

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

            // Mentions: if no tool calls, route to mentioned agents by scheduling the agent message again (as sender=agent)
            if ((!toolCalls || toolCalls.length === 0) && answer) {
                const mentions = answer.match(/@(\w+)/g);
                if (mentions && mentions.length > 0) {
                    producedEvents.push({
                        threadId: event.threadId,
                        type: "AGENT_MESSAGE",
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
        }

        return { producedEvents };
    }
};

const toolCallProcessor: EventProcessor<ToolCallPayload> = {
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
        const parseInput = (input: unknown): unknown => {
            if (typeof input === 'string') { try { return JSON.parse(input); } catch { return input; } }
            return input;
        };

        const logEntry: NewToolLog = {
            threadId: event.threadId,
            agentId: null as unknown as string | undefined,
            taskId: (context.activeTaskId as unknown as string | undefined) || undefined,
            toolName,
            toolInput: parseInput(call.function.arguments) as unknown,
            toolOutput: result.output as unknown,
            status: result.error ? "error" : "success",
            errorMessage: result.error ? String(result.error) : undefined,
            metadata: undefined as unknown as Record<string, unknown> | undefined,
        };
        await ops.createToolLogs([logEntry]);

        let content: string;
        if (result.error) {
            content = `❌ TOOL ERROR: ${String(result.error)}\n\nPlease review the error above and try again with the correct format.`;
        } else if (result.output) {
            content = typeof result.output === 'string' ? `✅ TOOL SUCCESS: ${result.output}` : `✅ TOOL SUCCESS: ${JSON.stringify(result.output)}`;
        } else {
            content = `⚠️ TOOL COMPLETED: No output returned`;
        }

        // Persist tool result message (from the tool, attributed to the agent for routing)
        await ops.createMessage({
            threadId: event.threadId,
            senderId: agent.name,
            senderType: "tool",
            content,
            toolCallId: payload.call.id,
        });

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
                    content,
                } as ToolResultPayload,
                parentEventId: event.id,
                traceId: event.traceId,
            }
        ];

        return { producedEvents };
    }
};

const toolResultProcessor: EventProcessor<ToolResultPayload> = {
    shouldProcess: () => true,
    process: async (event) => {
        // Schedule a follow-up message event to let the agent continue after tool result
        const payload = event.payload;
        const producedEvents: NewQueueEvent[] = [
            {
                threadId: event.threadId,
                type: "USER_MESSAGE", // Trigger processing loop; the message will be routed back to the agent via senderType: tool
                payload: {
                    senderId: payload.agentName,
                    senderType: "tool",
                    content: payload.content || "",
                } as MessagePayload,
                parentEventId: event.id,
                traceId: event.traceId,
            }
        ];
        return { producedEvents };
    }
};

// Processor registry
const processors: Record<EventType, EventProcessor<any>> = {
    USER_MESSAGE: messageProcessor as EventProcessor<MessagePayload>,
    AGENT_MESSAGE: messageProcessor as EventProcessor<MessagePayload>,
    TOOL_CALL: toolCallProcessor as EventProcessor<ToolCallPayload>,
    TOOL_RESULT: toolResultProcessor as EventProcessor<ToolResultPayload>,
    SYSTEM: {
        shouldProcess: () => true,
        process: () => Promise.resolve({ producedEvents: [] })
    }
};

// Unified onEvent callback handler (mutate/override semantics)
type OnEventResponse =
    | void
    | { event: QueueEvent<unknown> }
    | { producedEvents: NewQueueEvent[] }
    | { drop: true };

async function runWithOnEvent(
    event: QueueEvent,
    deps: ProcessorDeps
): Promise<ProcessResult> {
    const callbacks = deps.context.callbacks || {};
    const handler: undefined | ((ev: QueueEvent<unknown>, process: (e?: QueueEvent<unknown>) => Promise<ProcessResult>) => Promise<OnEventResponse | void>) = (callbacks as any).onEvent;

    const executeDefault = async (e: QueueEvent<unknown> = event): Promise<ProcessResult> => {
        const processor = processors[e.type];
        if (!processor) return { producedEvents: [] };
        const ok = await processor.shouldProcess(e as QueueEvent<unknown>, deps);
        if (!ok) return { producedEvents: [] };
        // Narrow payload type based on event.type
        switch (e.type) {
            case "USER_MESSAGE":
            case "AGENT_MESSAGE":
                return (processor as EventProcessor<MessagePayload>).process(e as QueueEvent<MessagePayload>, deps);
            case "TOOL_CALL":
                return (processor as EventProcessor<ToolCallPayload>).process(e as QueueEvent<ToolCallPayload>, deps);
            case "TOOL_RESULT":
                return (processor as EventProcessor<ToolResultPayload>).process(e as QueueEvent<ToolResultPayload>, deps);
            case "SYSTEM":
            default:
                return processor.process(e as QueueEvent<unknown>, deps);
        }
    };

    if (!handler) {
        return executeDefault(event);
    }

    try {
        const resp = await handler(event, async (overrideEvent?: QueueEvent<unknown>) => {
            return executeDefault(overrideEvent || event);
        });

        if (!resp) {
            return executeDefault(event);
        }

        if ((resp as { drop?: boolean }).drop) {
            return { producedEvents: [] };
        }

        if ((resp as { event?: QueueEvent<unknown> }).event) {
            return executeDefault((resp as { event: QueueEvent<unknown> }).event);
        }

        if ((resp as { producedEvents?: NewQueueEvent[] }).producedEvents) {
            return { producedEvents: (resp as { producedEvents: NewQueueEvent[] }).producedEvents };
        }

        return executeDefault(event);
    } catch (err) {
        console.error("onEvent handler error:", err);
        return executeDefault(event);
    }
}

// Queue helpers wrapping legacy queue schema with our envelope
async function enqueueEvents(ops: Operations, events: NewQueueEvent[]): Promise<void> {
    for (const e of events) {
        const envelope: EventEnvelope = { _kind: "event", event: e as QueueEvent };
        await ops.addToQueue(e.threadId, envelope as unknown as NewMessage);
    }
}

function isEventEnvelope(message: unknown): message is EventEnvelope {
    const m = message as { _kind?: unknown; event?: { type?: unknown } };
    return !!(m && typeof m === 'object' && m._kind === 'event' && m.event && typeof m.event.type === 'string');
}

// Public API
export async function enqueueEvent(db: unknown, event: NewQueueEvent): Promise<void> {
    const ops = createOperations(db);
    const envelope: EventEnvelope = { _kind: "event", event: event as QueueEvent<unknown> };
    await ops.addToQueue(event.threadId, envelope as unknown as NewMessage);
}

export async function startThreadEventWorker(
    db: unknown,
    threadId: string,
    context: ChatContext
): Promise<void> {
    const ops = createOperations(db);

    // Prevent re-entrancy similar to legacy behavior
    const processing = await ops.getProcessingQueueItem(threadId);
    if (processing) return;

    while (true) {
        const next = await ops.getNextPendingQueueItem(threadId);
        if (!next) break;

        // Only process our envelopes; if not ours, leave it for the legacy engine
        if (!isEventEnvelope(next.message)) {
            break;
        }

        await ops.updateQueueItemStatus(next.id, "processing");

        try {
            // Build deps
            const thread = await ops.getThreadById(threadId);
            if (!thread) throw new Error(`Thread not found: ${threadId}`);

            const deps: ProcessorDeps = { ops, db, thread, context };
            const event = next.message.event as QueueEvent;

            const { producedEvents } = await runWithOnEvent(event, deps);

            if (producedEvents && producedEvents.length > 0) {
                await enqueueEvents(ops, producedEvents);
            }

            await ops.updateQueueItemStatus(next.id, "completed");
        } catch (err) {
            console.error("Event worker failed:", err);
            await ops.updateQueueItemStatus(next.id, "failed");
            break; // avoid hot loop on persistent error
        }
    }
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
        type: senderType === "user" ? "USER_MESSAGE" : "AGENT_MESSAGE",
        payload: {
            senderId,
            senderType,
            content: initial.content,
        } as MessagePayload,
    });

    await startThreadEventWorker(db, initial.threadId, context);
}


