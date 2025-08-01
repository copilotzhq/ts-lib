import { processToolCalls } from "../tools/processing.ts";
import { getNativeTools } from "../tools/registry/index.ts";
import { generateAllApiTools } from "../tools/api-generator.ts";
import { generateAllMcpTools } from "../tools/mcp-generator.ts";
import { createOperations, type Operations } from "../database/operations.ts";
import { createDatabase, DatabaseConfig } from "../database/index.ts";
import { chat } from "../../ai/index.ts";
import {
    NewMessage,
    Thread,
    Task,
    AgentConfig,
    RunnableTool,
    ChatInitMessage,
    ChatContext,
    MessageProcessingContext,
    AgentProcessingResult,
    LLMContextData,
    ChatManagementResult,
    ToolExecutionResult,
    ToolCallingData,
    ToolCompletedData,
    LLMCompletedData,
} from "../Interfaces.ts";
import { ToolDefinition, ChatMessage } from "../../ai/llm/types.ts";

// Constants
const DEFAULT_THREAD_NAME = "Main Thread";
const DEFAULT_SENDER_ID = "user";
const DEFAULT_SENDER_TYPE = "user";

/**
 * Escapes special regex characters in a string
 */
const escapeRegex = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Converts RunnableTool array to AI service compatible ToolDefinition array
 */
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
                ? tool.inputSchema as { type: 'object'; properties: Record<string, any>; required?: string[]; }
                : {
                    type: "object" as const,
                    properties: {} as Record<string, any>
                },
        },
    }));
};

/**
 * Builds processing context from database entities and configuration
 */
async function buildProcessingContext(
    ops: Operations,
    message: NewMessage,
    context: ChatContext,
    allSystemAgents?: AgentConfig[] // Pass full agent list separately
): Promise<MessageProcessingContext> {
    // Get thread information
    const thread: Thread | undefined = await ops.getThreadById(message.threadId!);
    if (!thread) {
        throw new Error(`Thread not found: ${message.threadId}`);
    }

    // Get message history
    const chatHistory = await ops.getMessageHistory(message.threadId!, message.senderId!);

    // Get active task if specified
    const activeTask = context.activeTaskId
        ? (await ops.getTaskById(context.activeTaskId)) || null
        : null;

    // Validate and get available agents (for conversation participants)
    const availableAgents = context.agents || [];
    if (availableAgents.length === 0) {
        throw new Error("No agents provided in context for this session");
    }

    // Merge all available tools
    const nativeToolsArray = Object.values(getNativeTools());
    const userTools = context.tools || [];

    // Generate API tools if API configs are provided
    const apiTools = context.apis ? generateAllApiTools(context.apis) : [];

    // Generate MCP tools if MCP server configs are provided
    const mcpTools = context.mcpServers ? await generateAllMcpTools(context.mcpServers) : [];

    const allTools = [...nativeToolsArray, ...userTools, ...apiTools, ...mcpTools];

    return {
        thread,
        chatHistory,
        activeTask,
        availableAgents,
        allTools,
        allSystemAgents: allSystemAgents || availableAgents, // Full system agents for tools
    };
}

/**
 * Discovers which agents should process the current message
 * Based on mentions, tool calls, or round-robin selection
 * Respects allowed agents configuration for agent-to-agent communication
 */
function discoverTargetAgents(
    message: NewMessage,
    processingContext: MessageProcessingContext
): AgentConfig[] {
    const { chatHistory, availableAgents, thread } = processingContext;

    // Case 1a: Message has tool calls - continue with same agent
    if (message.toolCalls && message.toolCalls.length > 0) {
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (lastMessage?.senderType === "agent") {
            const agent = availableAgents.find(a => a.name === lastMessage.senderId);
            return agent ? [agent] : [];
        }
    }

    // Case 1b: Tool result message - return to the agent who made the tool call
    if (message.senderType === "tool" && message.senderId) {
        const agent = availableAgents.find(a => a.name === message.senderId);
        if (agent) {
            return [agent];
        }
    }

    // Case 2: Message contains agent mentions (@AgentName)
    const mentions = message.content?.match(/@(\w+)/g);
    if (mentions) {
        const mentionedNames = mentions.map((m: string) => m.substring(1));
        const mentionedAgents = availableAgents.filter(a =>
            mentionedNames.includes(a.name)
        );

        if (mentionedAgents.length > 0) {
            // Apply agent filtering for agent-to-agent communication
            return filterAllowedAgents(message, mentionedAgents, availableAgents);
        }
    }

    // Case 3: Default to next available agent (only in 2-participant conversations)
    let candidateAgents: AgentConfig[] = [];

    // Only activate fallback in exactly 2-participant conversations (user-agent or agent-agent)
    if (thread.participants && thread.participants.length === 2) {
        // Find the other participant (not the sender)
        const otherParticipant: string | undefined = thread.participants.find((p: string) => p !== message?.senderId);

        // If the other participant is an agent, select it
        if (otherParticipant) {
            const otherAgent = availableAgents.find(a => a.name === otherParticipant);
            if (otherAgent) {
                candidateAgents = [otherAgent];
            }
        }
    }


    // Apply agent filtering for agent-to-agent communication
    return filterAllowedAgents(message, candidateAgents, availableAgents);
}

/**
 * Filters target agents based on allowed agents configuration
 * Only applies filtering when sender is an agent
 */
function filterAllowedAgents(
    message: NewMessage,
    targetAgents: AgentConfig[],
    availableAgents: AgentConfig[]
): AgentConfig[] {
    // No filtering needed for user messages

    if (message.senderType !== "agent") {
        return targetAgents;
    }

    // Find the sender agent
    const senderAgent = availableAgents.find(a => a.name === message.senderId);
    if (!senderAgent) {
        return targetAgents;
    }

    // If no allowed agents defined, allow all (backward compatibility)
    if (!senderAgent.allowedAgents) {
        return targetAgents;
    }

    // Filter target agents based on sender's allowed agents
    return targetAgents.filter(agent =>
        senderAgent.allowedAgents!.includes(agent.name)
    );
}

/**
 * Builds LLM context including thread, task, and agent information
 */
function buildLLMContext(
    agent: AgentConfig,
    processingContext: MessageProcessingContext
): LLMContextData {
    const { thread, activeTask, availableAgents, allSystemAgents } = processingContext;

    // Build thread context with participant information
    const participantInfo = thread.participants?.map((p: string) => {
        const agentInfo = availableAgents.find((a: AgentConfig) => a.name === p);
        return `name: ${p} | role: ${agentInfo?.role || "N/A"} | description: ${agentInfo?.description || "N/A"}`;
    }).join("\n- ") || "N/A";

    // Build available agents information (excluding current agent and existing participants)
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

    // Build task context if active task exists
    const taskContext = activeTask ? [
        "## TASK CONTEXT",
        `Current task: ${activeTask.name}`,
        `Goal: ${activeTask.goal}`,
        `Status: ${activeTask.status}`
    ].join("\n") : "";

    // Build agent identity context
    const agentContext = [
        "## IDENTITY",
        `You are ${agent.name}`,
        `Your role is: ${agent.role}`,
        `Personality: ${agent.personality}`,
        `Your instructions are: ${agent.instructions}`
    ].join("\n");

    // Combine all contexts
    const systemPrompt = [threadContext, taskContext, agentContext]
        .filter(Boolean)
        .join("\n\n");

    return {
        threadContext,
        taskContext,
        agentContext,
        systemPrompt,
    };
}

/**
 * Converts message history to LLM-compatible chat format
 * Preserves speaker identity in multi-participant conversations
 */
function buildLLMHistory(
    chatHistory: NewMessage[],
    currentAgent: AgentConfig
): ChatMessage[] {
    return chatHistory.map((msg) => {
        // Determine role based on sender type and agent identity
        const role = msg.senderType === "agent"
            ? (msg.senderId === currentAgent.name ? "assistant" : "user")
            : msg.senderType;

        // Preserve speaker identity for multi-participant clarity
        let content = msg.content || "";

        // Add speaker prefix for non-current agent messages to maintain context
        if (msg.senderType === "agent" && msg.senderId !== currentAgent.name) {
            // Other agents: prefix with their name for clarity
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "user" && msg.senderId !== "user") {
            // Named users: prefix with their identifier
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "tool") {
            // Tool messages: prefix with tool context
            content = `[Tool Result]: ${content}`;
        }
        // Current agent messages keep original content (they're "assistant" role)

        return {
            content,
            role: role,
            tool_call_id: msg.toolCallId || undefined
        };
    });
}

/**
 * Triggers callback if provided in context
 */
async function triggerCallback(
    context: ChatContext,
    callbackName: keyof NonNullable<ChatContext['callbacks']>,
    data: any
): Promise<void> {
    const callback = context.callbacks?.[callbackName];
    if (callback) {
        await (callback as any)(data);
    }
}

/**
 * Processes tool execution results and triggers callbacks
 */
async function processToolExecutionResults(
    ops: Operations,
    agent: AgentConfig,
    toolCalls: any[],
    toolResults: ToolExecutionResult[],
    message: NewMessage,
    context: ChatContext,
    activeTask: Task | null,
    toolStartTimes?: Map<string, number>
): Promise<void> {
    // Create tool log entries for database
    const toolLogEntries = toolCalls.map((call, i) => ({
        threadId: message.threadId,
        agentId: null, // Code-first agents don't have DB IDs
        taskId: activeTask?.id,
        toolName: call.function.name,
        toolInput: JSON.stringify(call.function.arguments),
        toolOutput: JSON.stringify(toolResults[i].output),
        status: toolResults[i].error ? "error" as const : "success" as const,
        errorMessage: toolResults[i].error ? String(toolResults[i].error) : undefined,
    }));

    await ops.createToolLogs(toolLogEntries);

    // Trigger tool completed callbacks
    for (let i = 0; i < toolCalls.length; i++) {
        const call = toolCalls[i];
        const result = toolResults[i];
        const toolCallId = call.id || `${call.function.name}_${i}`;
        const endTime = Date.now();
        const timestamp = new Date(endTime);

        // Calculate actual duration from start time
        const startTime = toolStartTimes?.get(toolCallId);
        const duration = startTime ? endTime - startTime : undefined;

        // Trigger onToolCompleted callback
        await triggerCallback(context, 'onToolCompleted', {
            threadId: message.threadId!,
            agentName: agent.name,
            toolName: call.function.name,
            toolInput: call.function.arguments,
            toolCallId,
            toolOutput: result.output,
            error: result.error ? String(result.error) : undefined,
            duration,
            timestamp,
        } as ToolCompletedData);
    }

    // Create and save tool result messages with clear success/error distinction
    const toolResultMessages: NewMessage[] = toolResults.map(r => {
        let content: string;

        if (r.error) {
            // Clear error message for self-correction
            content = `❌ TOOL ERROR: ${String(r.error)}\n\nPlease review the error above and try again with the correct format.`;
        } else if (r.output) {
            // Successful execution
            content = `✅ TOOL SUCCESS: ${JSON.stringify(r.output)}`;
        } else {
            // Edge case: no output or error
            content = `⚠️ TOOL COMPLETED: No output returned`;
        }

        return {
            threadId: message.threadId,
            senderId: agent.name,
            senderType: "tool" as const,
            content,
            toolCallId: r.tool_call_id
        };
    });

    // Save tool results to database and queue for processing
    await Promise.all(toolResultMessages.map(async msg =>
        await ops.addToQueue(message.threadId!, msg)
    ));

    await Promise.all(toolResultMessages.map(msg => ops.createMessage(msg)));
}

/**
 * Processes a message for a single agent
 */
async function processAgentMessage(
    ops: Operations,
    db: any,
    agent: AgentConfig,
    message: NewMessage,
    processingContext: MessageProcessingContext,
    context: ChatContext
): Promise<AgentProcessingResult> {
    const { allTools, activeTask } = processingContext;

    // Build LLM context and history
    const llmContextData = buildLLMContext(agent, processingContext);
    const llmHistory = buildLLMHistory(processingContext.chatHistory, agent);

    // Get agent's available tools
    const agentTools = agent.allowedTools?.map(toolKey =>
        allTools.find(tool => tool.key === toolKey)
    ).filter((tool): tool is RunnableTool => tool !== undefined) || [];

    // Call LLM with agent context and optional streaming
    const llmTools = formatToolsForAI(agentTools);

    // Setup streaming callback if streaming is enabled
    const streamCallback = (context.stream && context.callbacks?.onTokenStream)
        ? (token: string) => {
            context.callbacks!.onTokenStream!({
                threadId: message.threadId!,
                agentName: agent.name,
                token,
                isComplete: false,
            });
        }
        : undefined;

    // Call LLM and track timing
    const llmStartTime = Date.now();
    const llmResponse = await chat({
        messages: [
            { role: "system", content: llmContextData.systemPrompt },
            ...llmHistory
        ],
        tools: llmTools,
        config: agent.llmOptions,
        stream: streamCallback,
    });

    const llmDuration = Date.now() - llmStartTime;

    // Trigger final stream callback to indicate completion
    if (streamCallback && context.callbacks?.onTokenStream) {
        context.callbacks.onTokenStream({
            threadId: message.threadId!,
            agentName: agent.name,
            token: "",
            isComplete: true,
        });
    }

    // Trigger LLM completed callback with request and response data
    await triggerCallback(context, 'onLLMCompleted', {
        threadId: message.threadId!,
        agentName: agent.name,
        systemPrompt: llmContextData.systemPrompt,
        messageHistory: [
            { role: "system", content: llmContextData.systemPrompt },
            ...llmHistory
        ],
        availableTools: agentTools.map(tool => tool.key),
        llmConfig: agent.llmOptions,
        llmResponse: {
            success: llmResponse.success,
            answer: llmResponse.success && "answer" in llmResponse ? llmResponse.answer : undefined,
            toolCalls: llmResponse.success && "toolCalls" in llmResponse ? llmResponse.toolCalls : undefined,
            error: llmResponse.success ? undefined : llmResponse.error,
            tokens: "tokens" in llmResponse ? llmResponse.tokens : undefined,
            model: "model" in llmResponse ? llmResponse.model : undefined,
            provider: "provider" in llmResponse ? llmResponse.provider : undefined,
        },
        duration: llmDuration,
        timestamp: new Date(),
    } as LLMCompletedData);

    // Handle LLM response
    if (!llmResponse.success) {
        console.error("LLM Error:", llmResponse.error);
        return { agent };
    }

    if (!("answer" in llmResponse) || !llmResponse.answer) {
        return { agent };
    }

    // Clean LLM response to prevent duplicate prefixes
    let cleanResponse = llmResponse.answer;

    // Remove self-referential prefix if LLM added one (e.g., "[TestAgent]: Hello" -> "Hello")
    const selfPrefixPattern = new RegExp(`^\\[${escapeRegex(agent.name)}\\]:\\s*`, 'i');
    cleanResponse = cleanResponse.replace(selfPrefixPattern, '');

    // Also remove @mention if LLM added one (e.g., "@TestAgent: Hello" -> "Hello")
    const selfMentionPattern = new RegExp(`^@${escapeRegex(agent.name)}:\\s*`, 'i');
    cleanResponse = cleanResponse.replace(selfMentionPattern, '');

    // Create and save agent response message
    const agentResponseMessage: NewMessage = {
        threadId: message.threadId,
        senderId: agent.name,
        senderType: "agent" as const,
        content: cleanResponse, // Use cleaned response without re-adding prefix
        toolCalls: llmResponse.toolCalls,
    };


    const savedMessage = await ops.createMessage(agentResponseMessage);

    // Trigger message sent callback
    await triggerCallback(context, 'onMessageSent', {
        threadId: message.threadId!,
        senderId: agent.name,
        senderType: "agent",
        content: agentResponseMessage.content!,
        timestamp: new Date(),
    });

    // Process tool calls if any
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // Track start times for duration calculation
        const toolStartTimes = new Map<string, number>();

        // Trigger onToolCalling callbacks before execution
        for (let i = 0; i < llmResponse.toolCalls.length; i++) {
            const call = llmResponse.toolCalls[i];
            const toolCallId = call.id || `${call.function.name}_${i}`;
            const startTime = Date.now();

            toolStartTimes.set(toolCallId, startTime);

            await triggerCallback(context, 'onToolCalling', {
                threadId: message.threadId!,
                agentName: agent.name,
                toolName: call.function.name,
                toolInput: call.function.arguments,
                toolCallId,
                timestamp: new Date(startTime),
            } as ToolCallingData);
        }

        const toolResults = await processToolCalls(
            llmResponse.toolCalls,
            agentTools,
            {
                ...context,
                senderId: agent.name,
                senderType: "agent",
                threadId: message.threadId,
                agents: processingContext.allSystemAgents, // Use full agent list for tools
                tools: processingContext.allTools,
                db: db // Pass database instance to tools
            }
        );

        await processToolExecutionResults(
            ops,
            agent,
            llmResponse.toolCalls,
            toolResults,
            message,
            context,
            activeTask,
            toolStartTimes
        );

        return { agent, response: savedMessage, toolResults };
    } else {
        // Queue agent response for continued processing
        await ops.addToQueue(message.threadId!, {
            threadId: message.threadId,
            senderId: agent.name,
            senderType: "agent" as const,
        });

        return { agent, response: savedMessage };
    }
}

/**
 * Main message processing function
 * Coordinates agent discovery, processing, and result handling
 */
async function processMessage(
    ops: Operations,
    db: any,
    currentMessage: NewMessage,
    context: ChatContext,
    allSystemAgents?: AgentConfig[] // Pass full agent list
): Promise<AgentProcessingResult[]> {
    // Build processing context
    const processingContext = await buildProcessingContext(ops, currentMessage, context, allSystemAgents);

    // Trigger message received callback
    await triggerCallback(context, 'onMessageReceived', {
        threadId: currentMessage.threadId!,
        senderId: currentMessage.senderId!,
        senderType: currentMessage.senderType!,
        content: currentMessage.content!,
        timestamp: new Date(),
    });

    // Discover target agents
    const targetAgents = discoverTargetAgents(currentMessage, processingContext);

    // Process message for each target agent
    const results: AgentProcessingResult[] = [];
    for (const agent of targetAgents) {
        const result = await processAgentMessage(
            ops,
            db,
            agent,
            currentMessage,
            processingContext,
            context
        );
        results.push(result);
    }

    return results;
}

/**
 * Processes the message queue for a specific thread
 * Ensures sequential processing and prevents race conditions
 */
async function processQueue(
    ops: Operations,
    db: any,
    threadId: string,
    context: ChatContext,
    allSystemAgents?: AgentConfig[] // Pass full agent list
): Promise<void> {
    // Check if another process is already handling this thread
    const currentlyProcessing = await ops.getProcessingQueueItem(threadId);
    if (currentlyProcessing) {
        return; // Exit to prevent concurrent processing
    }

    // Get next pending message for this thread
    const nextInQueue = await ops.getNextPendingQueueItem(threadId);
    if (!nextInQueue) {
        return; // No pending messages
    }

    // Mark message as processing
    await ops.updateQueueItemStatus(nextInQueue.id, "processing");

    try {
        // Process the message
        await processMessage(
            ops,
            db,
            nextInQueue.message as NewMessage,
            context,
            allSystemAgents // Pass full agent list to processMessage
        );

        // Mark as completed
        await ops.updateQueueItemStatus(nextInQueue.id, "completed");
    } catch (error) {
        console.error(`Failed to process message ${nextInQueue.id}:`, error);
        await ops.updateQueueItemStatus(nextInQueue.id, "failed");
    } finally {
        // Continue processing remaining queue items
        await processQueue(ops, db, threadId, context, allSystemAgents); // Pass full agent list in recursive call
    }
}

/**
 * Internal chat management implementation
 */
async function createThreadImpl(
    db: any,
    initialMessage: ChatInitMessage,
    context: ChatContext = {}
): Promise<ChatManagementResult> {
    // Create operations instance bound to this database
    const ops = createOperations(db);

    // Apply defaults for optional properties
    const threadId = initialMessage.threadId || crypto.randomUUID();
    const senderId = initialMessage.senderId || DEFAULT_SENDER_ID;
    const senderType = initialMessage.senderType || DEFAULT_SENDER_TYPE;

    // Create standardized message object
    const processMessage: NewMessage = {
        threadId,
        senderId,
        senderType,
        content: initialMessage.content,
    };


    // Ensure thread exists before processing
    if (!context.agents || context.agents.length === 0) {
        throw new Error(`Thread not found and no agents provided to create a new one: ${threadId}`);
    }

    // Store original full agent list for tools
    const allSystemAgents = context.agents;

    // Filter agents based on participants if provided
    let availableAgents = context.agents;
    if (initialMessage.participants && initialMessage.participants.length > 0) {
        availableAgents = context.agents.filter(agent =>
            initialMessage.participants!.includes(agent.name)
        );

        if (availableAgents.length === 0) {
            throw new Error(`No valid agents found from participants: ${initialMessage.participants.join(', ')}`);
        }
    }

    // Validate no duplicate agents in filtered agents
    const agentNames = availableAgents.map(a => a.name);
    const uniqueAgentNames = new Set(agentNames);
    if (agentNames.length !== uniqueAgentNames.size) {
        const duplicates = agentNames.filter((name, index) => agentNames.indexOf(name) !== index);
        throw new Error(`Duplicate agents detected: ${duplicates.join(', ')}`);
    }

    // Create thread with agent participants (ensure no duplicates)
    const uniqueParticipants = Array.from(new Set([senderId, ...agentNames]));

    await ops.findOrCreateThread(threadId, {
        parentThreadId: initialMessage.parentThreadId,
        name: initialMessage.threadName || DEFAULT_THREAD_NAME,
        participants: uniqueParticipants,
    });

    // Update context to use filtered agents for this conversation
    const filteredContext = {
        ...context,
        agents: availableAgents
    };

    // Save initial message and add to processing queue
    await ops.createMessage(processMessage);
    const newQueueItem = await ops.addToQueue(threadId, processMessage);

    // Start asynchronous queue processing
    await processQueue(ops, db, threadId, filteredContext, allSystemAgents);

    return {
        queueId: newQueueItem.id,
        status: "queued",
        threadId,
    };
}

/**
 * Factory function to create a chat management instance with its own database
 * @param config - Database configuration
 * @returns Promise<chatManagement function> bound to the specific database
 */

async function createThread(
    initialMessage: ChatInitMessage,
    context: ChatContext = {},
    dbCallback?: (db: any) => void
): Promise<ChatManagementResult> {
    // If a dbConfig is provided, use it, otherwise use the default
    const dbConfig: DatabaseConfig = context.dbConfig || { url: ':memory:' };
    // If a dbInstance is provided, use it, otherwise create a new database instance
    const db = context.dbInstance || await createDatabase(dbConfig);
    // If a dbCallback is provided, call it with the db instance
    dbCallback && dbCallback(db);
    // Create the thread
    return createThreadImpl(db, initialMessage, context);
}

export { createThread }
export default createThread;
