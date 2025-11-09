// Event-queue engine (now default)
import { startThreadEventWorker } from "@/event-processors/index.ts";
import { createDatabase, schema, migrations } from "@/database/index.ts";
import type { OminipgWithCrud } from "omnipg";

import type {
    Agent,
    API,
    ChatCallbacks,
    ChatContext,
    ChatInitMessage,
    CopilotzDb,
    DatabaseConfig,
    MCPServer,
    MessagePayload,
    Queue,
    Tool,
    ToolCallPayload,
    LLMCallPayload,
} from "./interfaces/index.ts";

declare function prompt(message?: string): string | null;

export { getNativeTools } from "@/event-processors/tool_call/native-tools-registry/index.ts";
export * from "@/interfaces/index.ts";
export { createDatabase, schema, migrations };
export type { ToolCallPayload, LLMCallPayload } from "@/interfaces/index.ts";

// JSON-schema-derived database typing helpers (single source of truth)
export type DbSchemas = typeof schema;
export type DbCrud = OminipgWithCrud<DbSchemas>["crud"];

export type CopilotzEvent =
    | { type: "NEW_MESSAGE"; payload: MessagePayload }
    | { type: "TOOL_CALL"; payload: ToolCallPayload }
    | { type: "LLM_CALL"; payload: LLMCallPayload };


export type AgentConfig = Agent; 
export type ToolConfig = Tool;
export type APIConfig = API;
export type MCPServerConfig = MCPServer;

type NormalizedCopilotzConfig = Omit<CopilotzConfig, "agents" | "tools" | "apis" | "mcpServers"> & {
    agents: Agent[];
    tools?: Tool[];
    apis?: API[];
    mcpServers?: MCPServer[];
};

function normalizeAgent(agent: AgentConfig): Agent {
    const now = new Date().toISOString();
    return {
        ...agent,
        createdAt: ("createdAt" in agent && agent.createdAt ? agent.createdAt : now) as Agent["createdAt"],
        updatedAt: ("updatedAt" in agent && agent.updatedAt ? agent.updatedAt : now) as Agent["updatedAt"],
    };
}

function normalizeTool(tool: ToolConfig): Tool {
    const now = new Date().toISOString();
    return {
        ...tool,
        createdAt: ("createdAt" in tool && tool.createdAt ? tool.createdAt : now) as Tool["createdAt"],
        updatedAt: ("updatedAt" in tool && tool.updatedAt ? tool.updatedAt : now) as Tool["updatedAt"],
    };
}

function normalizeApi(api: APIConfig): API {
    const now = new Date().toISOString();
    return {
        ...api,
        createdAt: ("createdAt" in api && api.createdAt ? api.createdAt : now) as API["createdAt"],
        updatedAt: ("updatedAt" in api && api.updatedAt ? api.updatedAt : now) as API["updatedAt"],
    };
}

function normalizeMcpServer(server: MCPServerConfig): MCPServer {
    const now = new Date().toISOString();
    return {
        ...server,
        createdAt: ("createdAt" in server && server.createdAt ? server.createdAt : now) as MCPServer["createdAt"],
        updatedAt: ("updatedAt" in server && server.updatedAt ? server.updatedAt : now) as MCPServer["updatedAt"],
    };
}

export interface CopilotzConfig {
    agents: AgentConfig[];
    tools?: ToolConfig[];
    apis?: APIConfig[];
    mcpServers?: MCPServerConfig[];
    callbacks?: ChatCallbacks;
    dbConfig?: DatabaseConfig;
    dbInstance?: CopilotzDb;
    threadMetadata?: Record<string, unknown>;
    queueTTL?: number;
    stream?: boolean;
    activeTaskId?: string;
}

export interface CopilotzRunResult {
    queueId: string;
    status: "queued";
    threadId: string;
}

export type CopilotzRunOverrides = Partial<Omit<NormalizedCopilotzConfig, "agents" | "tools" | "apis" | "mcpServers">> & {
    agents?: AgentConfig[];
    tools?: ToolConfig[];
    apis?: APIConfig[];
    mcpServers?: MCPServerConfig[];
    stream?: boolean;
};

export interface CopilotzSessionHistoryEntry {
    message: ChatInitMessage;
    result: CopilotzRunResult;
}

export interface CopilotzCliIO {
    prompt(message: string): Promise<string>;
    print(line: string): void;
}

export interface CopilotzSession {
    readonly externalId: string;
    readonly history: ReadonlyArray<CopilotzSessionHistoryEntry>;
    readonly threadId?: string;
    ask(input: string | ChatInitMessage, options?: { overrides?: CopilotzRunOverrides }): Promise<CopilotzRunResult>;
    close(): Promise<void>;
}

export interface CopilotzCliController {
    stop(): void;
    readonly closed: Promise<void>;
}

export interface CopilotzSessionOptions {
    externalId?: string;
    overrides?: CopilotzRunOverrides;
}

export interface CopilotzStartOptions extends CopilotzSessionOptions {
    initialMessage?: ChatInitMessage;
    quitCommand?: string;
    banner?: string | null;
    loop?: boolean;
    io?: CopilotzCliIO;
}

export interface Copilotz {
    readonly config: Readonly<CopilotzConfig>;
    readonly ops: CopilotzDb["ops"];
    run(initialMessage: ChatInitMessage, overrides?: CopilotzRunOverrides): Promise<CopilotzRunResult>;
    start(options?: CopilotzStartOptions): CopilotzCliController;
    createSession(options?: CopilotzSessionOptions): CopilotzSession;
    shutdown(): Promise<void>;
}

const DEFAULT_CLI_BANNER = "🎯 Starting Interactive Session.\nType your questions, or 'quit' to exit\n";

const DEFAULT_QUIT_COMMAND = "quit";

const DEFAULT_DIVIDER = "-".repeat(60);

function mergeCallbacks(base?: ChatCallbacks, override?: ChatCallbacks): ChatCallbacks | undefined {
    if (!base) return override;
    if (!override) return base;
    return {
        ...base,
        ...override,
    };
}

function buildRuntimeContext(
    base: NormalizedCopilotzConfig,
    overrides?: CopilotzRunOverrides,
    explicitStream?: boolean,
): ChatContext {
    const streamValue = explicitStream ?? overrides?.stream ?? base.stream ?? false;
    const mergedAgents = overrides?.agents
        ? overrides.agents.map(normalizeAgent)
        : base.agents;
    const mergedTools = overrides?.tools
        ? overrides.tools.map(normalizeTool)
        : base.tools;
    const mergedApis = overrides?.apis
        ? overrides.apis.map(normalizeApi)
        : base.apis;
    const mergedMcpServers = overrides?.mcpServers
        ? overrides.mcpServers.map(normalizeMcpServer)
        : base.mcpServers;
    return {
        agents: mergedAgents,
        tools: mergedTools,
        apis: mergedApis,
        mcpServers: mergedMcpServers,
        callbacks: mergeCallbacks(base.callbacks, overrides?.callbacks),
        dbConfig: overrides?.dbConfig ?? base.dbConfig,
        dbInstance: overrides?.dbInstance ?? base.dbInstance,
        threadMetadata: overrides?.threadMetadata ?? base.threadMetadata,
        queueTTL: overrides?.queueTTL ?? base.queueTTL,
        stream: streamValue,
        activeTaskId: overrides?.activeTaskId ?? base.activeTaskId,
    } satisfies ChatContext;
}

function resolveParticipants(
    initialMessage: ChatInitMessage,
    context: ChatContext,
): { senderId: string; senderType: MessagePayload["senderType"]; participants: string[] } {
    const agents = context.agents || [];

    const findAgentByIdentifier = (identifier?: string) => {
        if (!identifier) return undefined;
        return agents.find((agent) =>
            agent.name === identifier ||
            agent.id === identifier ||
            agent.externalId === identifier
        );
    };

    const requestedParticipants = (initialMessage.participants && initialMessage.participants.length > 0)
        ? initialMessage.participants
        : agents.map((a) => a.name);

    const normalizedParticipants = requestedParticipants
        .map((participant) => {
            const found = findAgentByIdentifier(participant);
            return found ? found.name : participant;
        })
        .filter((participant): participant is string => Boolean(participant));

    let senderType = initialMessage.senderType;
    let senderId = initialMessage.senderId;

    if (senderType === "agent") {
        const matchedAgent = findAgentByIdentifier(senderId);
        if (matchedAgent) {
            senderId = matchedAgent.name;
        } else if (!senderId && agents.length > 0) {
            senderId = agents[0].name;
        }
    } else if (!senderType && senderId) {
        const matchedAgent = findAgentByIdentifier(senderId);
        if (matchedAgent) {
            senderType = "agent";
            senderId = matchedAgent.name;
        }
    }

    if (!senderId) {
        senderId = "user";
    }

    if (!senderType) {
        senderType = senderId !== "user" && Boolean(findAgentByIdentifier(senderId)) ? "agent" : "user";
    }

    const uniqueParticipants = Array.from(new Set([senderId, ...normalizedParticipants]));

    return { senderId, senderType, participants: uniqueParticipants };
}

async function ensureThread(
    ops: CopilotzDb["ops"],
    initialMessage: ChatInitMessage,
    context: ChatContext,
): Promise<{ threadId: string; senderId: string; senderType: MessagePayload["senderType"] }> {
    const { senderId, senderType, participants } = resolveParticipants(initialMessage, context);
    const threadMetadata = initialMessage.threadMetadata ?? context.threadMetadata;

    let threadId: string | undefined = initialMessage.threadId;
    if (!threadId && initialMessage.threadExternalId) {
        const existingByExt = await ops.getThreadByExternalId(initialMessage.threadExternalId);
        if (existingByExt?.id) threadId = existingByExt.id as string;
    }
    threadId = threadId || crypto.randomUUID();

    await ops.findOrCreateThread(threadId, {
        name: initialMessage.threadName || "Main Thread",
        participants,
        externalId: initialMessage.threadExternalId || undefined,
        parentThreadId: initialMessage.parentThreadId,
        metadata: threadMetadata,
        status: "active",
        mode: "immediate",
    });

    return { threadId, senderId, senderType };
}

function buildWorkerContext(
    context: ChatContext,
    db: CopilotzDb | undefined,
    stream: boolean,
    userMetadata?: Record<string, unknown>,
): ChatContext {
    return {
        ...context,
        dbInstance: db,
        stream,
        userMetadata: userMetadata ?? context.userMetadata,
    };
}

async function enqueueInitialMessage(
    ops: CopilotzDb["ops"],
    threadId: string,
    payload: MessagePayload,
    ttlMs?: number,
): Promise<{ queueId: string }> {
    const queuePayload: Queue["payload"] = { ...payload };

    const queued = await ops.addToQueue(threadId, {
        eventType: "NEW_MESSAGE",
        payload: queuePayload,
        ttlMs,
    });
    if (typeof queued.id !== "string") {
        throw new Error("Queue id must be a string");
    }

    return { queueId: queued.id };
}

function mergeOverrides(
    base?: CopilotzRunOverrides,
    override?: CopilotzRunOverrides,
): CopilotzRunOverrides | undefined {
    if (!base) return override;
    if (!override) return base;
    return {
        ...base,
        ...override,
        callbacks: mergeCallbacks(base.callbacks, override.callbacks),
    };
}

function defaultCliIO(): CopilotzCliIO {
    return {
        prompt: (message: string) => {
            if (typeof prompt === "function") {
                const response = prompt(message);
                return Promise.resolve(response ?? "");
            }
            return Promise.reject(new Error("No CLI prompt implementation available. Provide a custom io.prompt handler."));
        },
        print: (line: string) => console.log(line),
    };
}

export async function createCopilotz(config: CopilotzConfig): Promise<Copilotz> {

    const normalizedAgents = config.agents.map(normalizeAgent);
    const normalizedTools = config.tools?.map(normalizeTool);
    const normalizedApis = config.apis?.map(normalizeApi);
    const normalizedMcpServers = config.mcpServers?.map(normalizeMcpServer);

    const baseConfig: NormalizedCopilotzConfig = {
        ...config,
        agents: normalizedAgents,
        tools: normalizedTools,
        apis: normalizedApis,
        mcpServers: normalizedMcpServers,
    };

    const managedDb = config.dbInstance ? undefined : await createDatabase(config.dbConfig);
    const baseDb = config.dbInstance ?? managedDb;
    if (!baseDb) {
        throw new Error("Failed to initialize Copilotz database instance.");
    }
    const baseOps = baseDb.ops;

    const activeSessions = new Set<CopilotzSession>();

    const performRun = async (
        initialMessage: ChatInitMessage,
        overrides?: CopilotzRunOverrides,
    ): Promise<CopilotzRunResult> => {

        if (!initialMessage?.content && !initialMessage?.toolCalls?.length) {
            throw new Error("initialMessage with content or toolCalls is required.");
        }

        const runtimeContext = buildRuntimeContext(baseConfig, overrides);
        const db = runtimeContext.dbInstance
            ? runtimeContext.dbInstance
            : await createDatabase(runtimeContext.dbConfig ?? baseConfig.dbConfig);

        const ops = db.ops;
        const { threadId, senderId, senderType } = await ensureThread(ops, initialMessage, runtimeContext);
        const initialUserMetadata = (initialMessage.user?.metadata && typeof initialMessage.user.metadata === "object")
            ? initialMessage.user.metadata as Record<string, unknown>
            : undefined;

        const workerContext = buildWorkerContext(
            runtimeContext,
            db,
            runtimeContext.stream ?? false,
            initialUserMetadata,
        );

        const { queueId } = await enqueueInitialMessage(ops, threadId, {
            senderId,
            senderType,
            content: initialMessage.content,
            metadata: initialMessage.metadata,
            toolCalls: initialMessage.toolCalls,
        });

        await startThreadEventWorker(db, threadId, workerContext);

        return { queueId, status: "queued", threadId };
    };

    const createSessionInternal = (options?: CopilotzSessionOptions): CopilotzSession => {
        const sessionOverrides = options?.overrides;
        const externalId = options?.externalId ?? crypto.randomUUID().slice(0, 24);
        const history: CopilotzSessionHistoryEntry[] = [];
        let closed = false;
        let threadIdRef: string | undefined;

        const session: CopilotzSession = {
            externalId,
            get history() {
                return history.slice();
            },
            get threadId() {
                return threadIdRef;
            },
            ask: async (input, askOptions) => {
                if (closed) {
                    throw new Error("This CLI session has already been closed.");
                }

                const message = typeof input === "string" ? { content: input } : { ...input };

                if (!message.content) {
                    throw new Error("CLI session messages must include content.");
                }

                if (!message.threadExternalId) {
                    message.threadExternalId = externalId;
                }

                if (!message.threadId && threadIdRef) {
                    message.threadId = threadIdRef;
                }

                const mergedOverrides = mergeOverrides(sessionOverrides, askOptions?.overrides);

                const result = await performRun(message, mergedOverrides);

                threadIdRef = message.threadId ?? result.threadId;
                history.push({ message, result });

                return result;
            },
            close: () => {
                closed = true;
                activeSessions.delete(session);
                return Promise.resolve();
            },
        };

        activeSessions.add(session);
        return session;
    };

    const start = (options?: CopilotzStartOptions): CopilotzCliController => {
        const quitCommand = options?.quitCommand ?? DEFAULT_QUIT_COMMAND;
        const loop = options?.loop ?? true;
        const banner = options?.banner ?? DEFAULT_CLI_BANNER;
        const io = options?.io ?? defaultCliIO();

        const session = createSessionInternal({
            externalId: options?.externalId,
            overrides: mergeOverrides({ stream: true }, options?.overrides),
        });

        let stopped = false;

        const closed = (async () => {
            if (banner) io.print(banner);

            if (options?.initialMessage?.content) {
                try {
                    await session.ask(options.initialMessage);
                } catch (error) {
                    io.print(`❌ Session failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            if (!loop) {
                await session.close();
                return;
            }

            while (!stopped) {
                let question: string;
                try {
                    question = (await io.prompt("Message: ")) ?? "";
                } catch (error) {
                    io.print(`❌ Unable to read input: ${error instanceof Error ? error.message : String(error)}`);
                    break;
                }

                if (!question || question.toLowerCase() === quitCommand) {
                    io.print("👋 Ending session. Goodbye!");
                    break;
                }

                io.print("\n🔬 Thinking...\n");

                try {
                    await session.ask({ content: question, senderId: "user", senderType: "user" });
                } catch (error) {
                    io.print(`❌ Session failed: ${error instanceof Error ? error.message : String(error)}`);
                }

                io.print(`\n${DEFAULT_DIVIDER}\n`);
            }

            await session.close();
        })();

        return {
            stop: () => {
                stopped = true;
            },
            closed,
        } satisfies CopilotzCliController;
    };

    return {
        config: Object.freeze({ ...baseConfig }),
        get ops() {
            return baseOps;
        },
        run: performRun,
        start,
        createSession: createSessionInternal,
        shutdown: async () => {
            for (const session of Array.from(activeSessions)) {
                await session.close().catch(() => undefined);
            }

            if (managedDb && typeof (managedDb as unknown as { close?: () => Promise<void> | void }).close === "function") {
                await (managedDb as unknown as { close: () => Promise<void> | void }).close();
            } else if (managedDb && typeof (managedDb as unknown as { end?: () => Promise<void> | void }).end === "function") {
                await (managedDb as unknown as { end: () => Promise<void> | void }).end();
            }
        },
    } satisfies Copilotz;
}
