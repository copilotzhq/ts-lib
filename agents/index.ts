// Event-queue engine (now default)
import { enqueueEvent, startThreadEventWorker } from "./threads/event-queue.ts";
import { createOperations } from "./database/operations.ts";
import { createDatabase } from "./database/index.ts";
// Import the Interfaces
import type * as Interfaces from "./Interfaces.ts";

// Export all interfaces
export * from "./Interfaces.ts";

// Export all tools from the registry
export * from "./tools/registry/index.ts";

// Export tool generators
export * from "./tools/api-generator.ts";
export * from "./tools/mcp-generator.ts";

// Export database
export * from "./database/index.ts";
export * as knowledgeDatabase from "../knowledge/database/index.ts";

export * as utils from "./utils/index.ts";

// Export event-queue engine (experimental)
export { startThreadEventWorker, enqueueEvent, createThreadWithEventEngine } from "./threads/event-queue.ts";

// Default createThread now uses the event-queue engine
export async function createThread(
    initialMessage: Interfaces.ChatInitMessage,
    context: Interfaces.ChatContext = {},
    dbCallback?: (db: unknown) => void
): Promise<Interfaces.ChatManagementResult> {
    // Prepare DB
    const db = context.dbInstance || await createDatabase(context.dbConfig || { url: ':memory:' });
    const ops = createOperations(db);
    dbCallback && dbCallback(db);

    // Resolve/create thread by external id or provided id
    let threadId: string | undefined = initialMessage.threadId;
    if (!threadId && initialMessage.threadExternalId) {
        const existingByExt = await ops.getThreadByExternalId(initialMessage.threadExternalId);
        if (existingByExt?.id) {
            threadId = existingByExt.id as string;
        }
    }
    threadId = threadId || crypto.randomUUID();

    // Determine participants
    const senderId = initialMessage.senderId || 'user';
    const participants = (initialMessage.participants && initialMessage.participants.length > 0)
        ? initialMessage.participants
        : (context.agents ? context.agents.map(a => a.name) : []);
    const uniqueParticipants = Array.from(new Set([senderId, ...participants]));

    // Ensure thread exists
    await ops.findOrCreateThread(threadId, {
        name: initialMessage.threadName || 'Main Thread',
        participants: uniqueParticipants,
        externalId: initialMessage.threadExternalId || undefined,
        parentThreadId: initialMessage.parentThreadId,
    } as Interfaces.NewThread);

    // Build execution context for worker (ensure dbInstance is passed through)
    const workerContext: Interfaces.ChatContext = {
        ...context,
        dbInstance: db,
        stream: context.stream ?? false,
    };

    // Enqueue the initial event (message gets persisted by the worker)
    const queued = await ops.addToQueue(threadId, {
        eventType: 'MESSAGE',
        payload: {
            senderId: senderId,
            senderType: initialMessage.senderType || 'user',
            content: initialMessage.content,
        } as Interfaces.MessagePayload,
    });

    // Process the queue for this thread
    await startThreadEventWorker(db, threadId, workerContext);

    return {
        queueId: queued.id,
        status: 'queued',
        threadId,
    };
}

// Export the runCli function for interactive session
export async function runCli({
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
    initialMessage?: Interfaces.ChatInitMessage;
    agents: Interfaces.AgentConfig[];
    participants?: string[];
    tools?: Interfaces.RunnableTool[];
    apis?: Interfaces.APIConfig[];
    mcpServers?: Interfaces.MCPServerConfig[];
    callbacks?: Interfaces.ChatCallbacks;
    dbConfig?: Interfaces.DatabaseConfig;
    dbInstance?: unknown;
}): Promise<void> {
    // Delegate to the event-queue based interactive session
    return await runEventQueue({
        initialMessage,
        participants,
        agents,
        tools,
        apis,
        mcpServers,
        callbacks,
        dbConfig,
        dbInstance,
    });
}

// Non-interactive runner: single-shot createThread convenience
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
    initialMessage?: Interfaces.ChatInitMessage;
    agents: Interfaces.AgentConfig[];
    participants?: string[];
    tools?: Interfaces.RunnableTool[];
    apis?: Interfaces.APIConfig[];
    mcpServers?: Interfaces.MCPServerConfig[];
    callbacks?: Interfaces.ChatCallbacks;
    dbConfig?: Interfaces.DatabaseConfig;
    dbInstance?: unknown;
    stream?: boolean;
}): Promise<Interfaces.ChatManagementResult> {
    if (!initialMessage?.content) {
        throw new Error("initialMessage with content is required for run()");
    }

    const message: Interfaces.ChatInitMessage = {
        ...initialMessage,
        participants: initialMessage.participants || participants,
    };

    const context: Interfaces.ChatContext = {
        agents,
        tools,
        apis,
        mcpServers,
        callbacks,
        dbConfig,
        dbInstance,
        stream: stream ?? false,
    };

    return await createThread(message, context);
}

// Experimental: interactive session using the new event-queue engine
export async function runEventQueue({
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
    initialMessage?: Interfaces.ChatInitMessage;
    agents: Interfaces.AgentConfig[];
    participants?: string[];
    tools?: Interfaces.RunnableTool[];
    apis?: Interfaces.APIConfig[];
    mcpServers?: Interfaces.MCPServerConfig[];
    callbacks?: Interfaces.ChatCallbacks;
    dbConfig?: Interfaces.DatabaseConfig;
    dbInstance?: unknown;
}) {
    console.log("🎯 Starting Interactive Session (Event Queue)");
    console.log("Type your questions, or 'quit' to exit\n");

    // generate a stable external id for the session
    const externalId = crypto.randomUUID().slice(0, 24);

    // Prepare DB
    const db = dbInstance || await createDatabase(dbConfig || { url: ':memory:' });
    const ops = createOperations(db);

    let c = 0;

    while (true) {
        let question: string;
        if (c === 0 && initialMessage?.content) {
            question = initialMessage.content;
            c++;
        } else {
            question = prompt("Question: ") || '';
        }

        if (!question || question.toLowerCase() === 'quit') {
            console.log("👋 Ending session. Goodbye!");
            break;
        }

        console.log('Question', question);
        console.log("\n🔬 Thinking...\n");

        try {
            // Resolve/create thread by external id once per session
            let threadId: string;
            const existingByExt = await ops.getThreadByExternalId(externalId);
            if (existingByExt?.id) {
                threadId = existingByExt.id as string;
            } else {
                threadId = crypto.randomUUID();
                const participantNames = (participants && participants.length > 0)
                    ? participants
                    : agents.map(a => a.name);
                const uniqueParticipants = Array.from(new Set(["user", ...participantNames]));
                await ops.findOrCreateThread(threadId, {
                    name: "Main Thread",
                    participants: uniqueParticipants,
                    externalId,
                } as Interfaces.NewThread);
            }

            // Build context
            const context: Interfaces.ChatContext = {
                agents,
                tools,
                apis,
                mcpServers,
                callbacks,
                dbConfig,
                dbInstance: db,
                stream: true,
            };

            // Enqueue the user message event and process the queue
            await enqueueEvent(db, {
                threadId: threadId,
                type: "MESSAGE",
                payload: { senderId: "user", senderType: "user", content: question }
            });
            await startThreadEventWorker(db, threadId, context);

        } catch (error) {
            console.error("❌ Session failed:", error);
        }

        console.log("\n" + "-".repeat(60) + "\n");
    }
}