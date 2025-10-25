// Event-queue engine (now default)
import { enqueueEvent, startThreadEventWorker } from "@/event-processors/index.ts";
import { createOperations } from "@/database/operations/index.ts";
import { createDatabase } from "@/database/index.ts";
import type {
    ChatContext,
    ChatInitMessage,
    MessagePayload,
    Agent,
    Tool,
    API,
    MCPServer,
    DatabaseConfig,
    ChatCallbacks,
    NewThread
} from "./interfaces/index.ts";

// Export all tools from the registry
export * from "@/event-processors/tool_call/native-tools-registry/index.ts";
// Export interfaces
export * from "@/interfaces/index.ts";

// Export tool generators
export * from "@/event-processors/tool_call/generators/api-generator.ts";
export * from "@/event-processors/tool_call/generators/mcp-generator.ts";

// Export database (root)
export * from "./database/index.ts";

// export * as utils from "./utils/index.ts";

async function prepareDb(context: ChatContext): Promise<{ db: any; ops: ReturnType<typeof createOperations> }> {
    const db = context.dbInstance || await createDatabase(context.dbConfig || { url: ':memory:' });
    const ops = createOperations(db);
    return { db, ops };
}

function resolveParticipants(initialMessage: ChatInitMessage, context: ChatContext): { senderId: string; participants: string[] } {
    const senderId = initialMessage.senderId || 'user';
    const participants = (initialMessage.participants && initialMessage.participants.length > 0)
        ? initialMessage.participants
        : (context.agents ? context.agents.map(a => a.name) : []);
    const uniqueParticipants = Array.from(new Set([senderId, ...participants]));
    return { senderId, participants: uniqueParticipants };
}

async function ensureThread(
    ops: ReturnType<typeof createOperations>,
    initialMessage: ChatInitMessage,
    context: ChatContext
): Promise<{ threadId: string; senderId: string }> {
    const { senderId, participants } = resolveParticipants(initialMessage, context);

    let threadId: string | undefined = initialMessage.threadId;
    if (!threadId && initialMessage.threadExternalId) {
        const existingByExt = await ops.getThreadByExternalId(initialMessage.threadExternalId);
        if (existingByExt?.id) threadId = existingByExt.id as string;
    }
    threadId = threadId || crypto.randomUUID();

    await ops.findOrCreateThread(threadId, {
        name: initialMessage.threadName || 'Main Thread',
        participants,
        externalId: initialMessage.threadExternalId || undefined,
        parentThreadId: initialMessage.parentThreadId,
    } as NewThread);

    return { threadId, senderId };
}

function buildWorkerContext(context: ChatContext, db: unknown, stream: boolean): ChatContext {
    return {
        ...context,
        dbInstance: db,
        stream,
    };
}

async function enqueueInitialMessage(
    ops: ReturnType<typeof createOperations>,
    threadId: string,
    payload: MessagePayload
): Promise<{ queueId: string }> {
    const queued = await ops.addToQueue(threadId, { eventType: 'NEW_MESSAGE', payload });
    return { queueId: queued.id };
}

// Export the runCLI function for interactive session
export async function runCLI({
    initialMessage,
    participants,
    agents,
    tools,
    apis,
    mcpServers,
    callbacks,
    dbConfig,
    dbInstance
}: {
    initialMessage?: ChatInitMessage;
    agents: Agent[];
    participants?: string[];
    tools?: Tool[];
    apis?: API[];
    mcpServers?: MCPServer[];
    callbacks?: ChatCallbacks;
    dbConfig?: DatabaseConfig;
    dbInstance?: unknown;
}): Promise<void> {
    console.log("🎯 Starting Interactive Session (Event Queue)");
    console.log("Type your questions, or 'quit' to exit\n");

    // generate a stable external id for the session
    const externalId = crypto.randomUUID().slice(0, 24);

    // Prepare DB once per CLI session
    const { db, ops } = await prepareDb({ dbInstance, dbConfig } as ChatContext);

    let c = 0;

    while (true) {
        let question: string;
        if (c === 0 && initialMessage?.content) {
            question = initialMessage.content;
            c++;
        } else {
            question = prompt("Message: ") || '';
        }

        if (!question || question.toLowerCase() === 'quit') {
            console.log("👋 Ending session. Goodbye!");
            break;
        }

        console.log("\n🔬 Thinking...\n");

        try {
            // Resolve/create thread by external id once per session
            let threadId: string;
            const existingByExt = await ops.getThreadByExternalId(externalId);
            if (existingByExt?.id) {
                threadId = existingByExt.id as string;
            } else {
                threadId = crypto.randomUUID();
                const uniqueParticipants = Array.from(new Set(["user", ...((participants && participants.length > 0) ? participants : agents.map(a => a.name))]));
                await ops.findOrCreateThread(threadId, { name: "Main Thread", participants: uniqueParticipants, externalId } as NewThread);
            }

            // Build context
            const context: ChatContext = buildWorkerContext({ agents, tools, apis, mcpServers, callbacks, dbConfig } as ChatContext, db, true);

            // Enqueue the user message event and process the queue
            await enqueueEvent(db, { threadId, type: "NEW_MESSAGE", payload: { senderId: "user", senderType: "user", content: question } });
            await startThreadEventWorker(db, threadId, context);

        } catch (error) {
            console.error("❌ Session failed:", error);
        }

        console.log("\n" + "-".repeat(60) + "\n");
    }
}


export async function run({
    initialMessage,
    participants,
    agents,
    tools,
    apis,
    mcpServers,
    callbacks,
    dbConfig,
    dbInstance,
    stream,
}: {
    initialMessage?: ChatInitMessage;
    agents: Agent[];
    participants?: string[];
    tools?: Tool[];
    apis?: API[];
    mcpServers?: MCPServer[];
    callbacks?: ChatCallbacks;
    dbConfig?: DatabaseConfig;
    dbInstance?: unknown;
    stream?: boolean;
}): Promise<{ queueId: string, status: 'queued', threadId: string }> {
    if (!initialMessage?.content) throw new Error("initialMessage with content is required for run()");

    const context: ChatContext = { agents, tools, apis, mcpServers, callbacks, dbConfig, dbInstance, stream: stream ?? false };
    const { db, ops } = await prepareDb(context);
    const { threadId, senderId } = await ensureThread(ops, { ...initialMessage, participants: initialMessage.participants || participants }, context);
    const workerContext = buildWorkerContext(context, db, context.stream ?? false);

    const { queueId } = await enqueueInitialMessage(ops, threadId, {
        senderId,
        senderType: initialMessage.senderType || 'user',
        content: initialMessage.content,
    } as MessagePayload);

    await startThreadEventWorker(db, threadId, workerContext);

    return { queueId, status: 'queued', threadId };
}
