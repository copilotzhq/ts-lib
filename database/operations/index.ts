import { queue, threads, messages, tasks, agents, apis, tools, mcpServers, users } from "../schemas/index.ts";
import { and, eq, sql, desc, asc } from "../drizzle.ts";
import type { NewMessage, Thread, Message, Task, NewTask, NewThread, Queue } from "../schemas/index.ts";

/**
 * Database operations factory - creates operation functions bound to a specific database instance
 */

export function createOperations(db: any): any {
    // Ephemeral in-process cache (per operations instance)
    type CacheEntry = { value: any; expiresAt: number };
    const cache = new Map<string, CacheEntry>();
    const msgHistoryKeysByThread = new Map<string, Set<string>>();
    const TTL_SHORT = 5_000;   // threads, tasks, histories
    const TTL_LONG = 30_000;   // catalogs (agents, tools, apis)

    const makeKey = (name: string, parts: unknown[]) => `${name}:${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('|')}`;
    const getCached = (key: string) => {
        const entry = cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
        return entry.value;
    };
    const setCached = (key: string, value: any, ttl: number) => { cache.set(key, { value, expiresAt: Date.now() + ttl }); return value; };
    const indexMsgHistoryKey = (threadId: string, key: string) => {
        if (!msgHistoryKeysByThread.has(threadId)) msgHistoryKeysByThread.set(threadId, new Set());
        msgHistoryKeysByThread.get(threadId)!.add(key);
    };
    const invalidateMsgHistory = (threadId: string) => {
        const keys = msgHistoryKeysByThread.get(threadId);
        if (keys) { keys.forEach(k => cache.delete(k)); keys.clear(); }
    };

    return {
        /** Queue operations 
         * 
         * @param threadId - The thread ID to add the event to
         * @param event - The event to add to the queue
         * @returns The new queue item
         */
        async addToQueue(threadId: string, event: { eventType: string; payload: object; parentEventId?: string; traceId?: string; priority?: number; metadata?: Record<string, unknown> }): Promise<Queue> {
            const [newQueueItem] = await db.insert(queue).values({
                threadId,
                eventType: event.eventType,
                payload: event.payload,
                parentEventId: event.parentEventId || null,
                traceId: event.traceId || null,
                priority: event.priority || null,
                metadata: event.metadata || null,
            }).returning();
            return newQueueItem;
        },
        /**
         * Get the processing queue item for a given thread
         * @param threadId - The thread ID to get the processing queue item for
         * @returns The processing queue item
         */
        async getProcessingQueueItem(threadId: string): Promise<Queue | undefined> {
            const [item] = await db
                .select()
                .from(queue)
                .where(and(eq(queue.threadId, threadId), eq(queue.status, "processing")))
                .limit(1);
            return item;
        },

        /**
         * Get the next pending queue item for a given thread
         * @param threadId - The thread ID to get the next pending queue item for
         * @returns The next pending queue item
         */
        async getNextPendingQueueItem(threadId: string): Promise<Queue | undefined> {
            const [item] = await db
                .select()
                .from(queue)
                .where(and(eq(queue.threadId, threadId), eq(queue.status, "pending")))
                .orderBy(
                    // Higher priority first; null treated as 0
                    desc(sql`COALESCE(${queue.priority}, 0)`),
                    asc(queue.createdAt),
                    asc(queue.id)
                )
                .limit(1);
            return item;
        },

        /**
         * Update the status of a queue item
         * @param queueId - The ID of the queue item to update
         * @param status - The new status of the queue item
         */
        async updateQueueItemStatus(queueId: string, status: "processing" | "completed" | "failed"): Promise<void> {
            await db.update(queue).set({ status }).where(eq(queue.id, queueId));
        },
        /**
         * Get the message history for a given thread and user
         * @param threadId - The thread ID to get the message history for
         * @param userId - The user ID to get the message history for
         * @param limit - The maximum number of messages to return
         * @returns The message history
         */
        async getMessageHistory(threadId: string, userId: string, limit: number = 50): Promise<NewMessage[]> {
            const cacheKey = makeKey('getMessageHistory', [threadId, userId, limit]);
            const cached = getCached(cacheKey);
            if (cached) return cached;
            const allMessages: (Message & { threadLevel: number })[] = [];
            let currentThreadId: string | null = threadId;
            let threadLevel = 0;

            while (currentThreadId) {
                const [thread]: (Thread | undefined)[] = await db
                    .select()
                    .from(threads)
                    .where(
                        and(
                            eq(threads.id, currentThreadId),
                            eq(threads.status, "active"),
                            sql`${threads.participants} ? ${userId}`
                        )
                    )
                    .limit(1);

                if (!thread) {
                    break;
                }

                const threadMessages: Message[] = await db
                    .select()
                    .from(messages)
                    .where(eq(messages.threadId, currentThreadId))

                // Add thread level to each message for sorting
                const messagesWithLevel = threadMessages.map(msg => ({
                    ...msg,
                    threadLevel
                }));

                allMessages.push(...messagesWithLevel);
                currentThreadId = thread.parentThreadId;
                threadLevel++;
            }

            // Sort by date first, then by thread level (lower level = parent thread comes first)
            allMessages.sort((a, b) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();

                if (dateA !== dateB) {
                    return dateA - dateB;
                }

                // If dates are the same, sort by thread level (parents first)
                return b.threadLevel - a.threadLevel;
            });

            // Remove the threadLevel property before returning
            const result = allMessages.slice(-limit).map(({ threadLevel, ...msg }) => msg);
            indexMsgHistoryKey(threadId, cacheKey);
            return setCached(cacheKey, result, TTL_SHORT);
        },

        /**
         * Get a thread by ID
         * @param threadId - The ID of the thread to get
         * @returns The thread
         */
        async getThreadById(threadId: string): Promise<Thread | undefined> {
            const cacheKey = makeKey('getThreadById', [threadId]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [thread] = await db
                .select()
                .from(threads)
                .where(and(
                    eq(threads.id, threadId),
                    eq(threads.status, "active")
                ))
                .limit(1);
            return setCached(cacheKey, thread, TTL_SHORT);
        },

        /**
         * Get a thread by external ID
         * @param externalId - The external ID of the thread to get
         * @returns The thread
         */
        async getThreadByExternalId(externalId: string): Promise<Thread | undefined> {
            const cacheKey = makeKey('getThreadByExternalId', [externalId]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [thread] = await db
                .select()
                .from(threads)
                .where(and(
                    eq(threads.externalId, externalId),
                    eq(threads.status, "active")
                ))
                .limit(1);
            return setCached(cacheKey, thread, TTL_SHORT);
        },

        /**
         * Get a thread by ID regardless of status
         * @param threadId - The ID of the thread to get
         * @returns The thread
         */
        async getThreadByIdRegardlessOfStatus(threadId: string): Promise<Thread | undefined> {
            const [thread] = await db
                .select()
                .from(threads)
                .where(eq(threads.id, threadId))
                .limit(1);
            return thread;
        },

        /**
         * Get a task by ID
         * @param taskId - The ID of the task to get
         * @returns The task
         */
        async getTaskById(taskId: string): Promise<Task | undefined> {
            const cacheKey = makeKey('getTaskById', [taskId]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [task] = await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, taskId))
                .limit(1);
            return setCached(cacheKey, task, TTL_SHORT);
        },

        /**
         * Create a message
         * @param message - The message to create
         * @returns The created message
         */
        async createMessage(message: NewMessage): Promise<Message> {
            const [newMessage] = await db.insert(messages).values(message).returning();
            if (message.threadId) invalidateMsgHistory(message.threadId);
            return newMessage;
        },

        /**
         * Find or create a thread
         * @param threadId - The ID of the thread to find or create
         * @param threadData - The data to create the thread with
         * @returns The created thread
         */
        async findOrCreateThread(threadId: string, threadData: NewThread): Promise<Thread> {
            let [thread]: Thread[] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
            if (!thread) {
                [thread] = await db.insert(threads).values({ id: threadId, ...threadData }).returning();
            }
            cache.delete(makeKey('getThreadById', [threadId]));
            if ((threadData as any).externalId) cache.delete(makeKey('getThreadByExternalId', [(threadData as any).externalId]));
            return thread;
        },

        /**
         * Archive a thread
         * @param threadId - The ID of the thread to archive
         * @param summary - The summary of the thread
         * @returns The archived thread
         */
        async archiveThread(threadId: string, summary: string): Promise<Thread[]> {
            const res = await db
                .update(threads)
                .set({ status: "archived", summary })
                .where(eq(threads.id, threadId))
                .returning();
            cache.delete(makeKey('getThreadById', [threadId]));
            return res;
        },

        /**
         * Create a task
         * @param taskData - The data to create the task with
         * @returns The created task
         */
        async createTask(taskData: NewTask): Promise<Task> {
            const [newTask] = await db.insert(tasks).values(taskData).returning();
            return newTask;
        },

        /**
         * Create an agent
         * @param agentData - The data to create the agent with
         * @returns The created agent
         */
        // Agent operations
        async createAgent(agentData: any): Promise<any> {
            // Ensure we only pass fields that exist in the schema
            const cleanAgentData = {
                name: agentData.name,
                externalId: agentData.externalId || null,
                role: agentData.role,
                personality: agentData.personality || null,
                instructions: agentData.instructions || null,
                description: agentData.description || null,
                agentType: agentData.agentType || "agentic",
                allowedAgents: agentData.allowedAgents || null,
                allowedTools: agentData.allowedTools || null,
                llmOptions: agentData.llmOptions || null,
                metadata: agentData.metadata || null,
            };

            const [newAgent] = await db.insert(agents).values(cleanAgentData).returning();
            cache.delete(makeKey('getAllAgents', []));
            cache.delete(makeKey('getAgentByName', [cleanAgentData.name]));
            return newAgent;
        },

        /**
         * Get all agents
         * @returns All agents
         */
        async getAllAgents(): Promise<any[]> {
            const cacheKey = makeKey('getAllAgents', []);
            const cached = getCached(cacheKey);
            if (cached) return cached;
            const rows = await db.select().from(agents);
            return setCached(cacheKey, rows, TTL_LONG);
        },

        /**
         * Get an agent by name
         * @param name - The name of the agent to get
         * @returns The agent
         */
        async getAgentByName(name: string): Promise<any | undefined> {
            const cacheKey = makeKey('getAgentByName', [name]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [agent] = await db.select().from(agents).where(eq(agents.name, name)).limit(1);
            return setCached(cacheKey, agent, TTL_LONG);
        },

        /**
         * Get an agent by external ID
         * @param externalId - The external ID of the agent to get
         * @returns The agent
         */
        async getAgentByExternalId(externalId: string): Promise<any | undefined> {
            const [agent] = await db.select().from(agents).where(eq(agents.externalId, externalId)).limit(1);
            return agent;
        },

        /**
         * Upsert an agent
         * @param agentData - The data to upsert the agent with
         * @returns The upserted agent
         */
        async upsertAgent(agentData: any): Promise<any> {
            // Prefer id, then name
            if (agentData.id) {
                const [existing] = await db.select().from(agents).where(eq(agents.id, agentData.id)).limit(1);
                if (existing) {
                    const [updated] = await db
                        .update(agents)
                        .set({
                            name: agentData.name ?? existing.name,
                            externalId: agentData.externalId ?? existing.externalId,
                            role: agentData.role ?? existing.role,
                            personality: agentData.personality ?? existing.personality,
                            instructions: agentData.instructions ?? existing.instructions,
                            description: agentData.description ?? existing.description,
                            agentType: agentData.agentType ?? existing.agentType,
                            allowedAgents: agentData.allowedAgents ?? existing.allowedAgents,
                            allowedTools: agentData.allowedTools ?? existing.allowedTools,
                            llmOptions: agentData.llmOptions ?? existing.llmOptions,
                            metadata: agentData.metadata ?? existing.metadata,
                        })
                        .where(eq(agents.id, agentData.id))
                        .returning();
                    cache.delete(makeKey('getAllAgents', []));
                    cache.delete(makeKey('getAgentByName', [updated.name]));
                    return updated;
                }
            }
            if (agentData.name) {
                const [existingByName] = await db.select().from(agents).where(eq(agents.name, agentData.name)).limit(1);
                if (existingByName) {
                    const [updated] = await db
                        .update(agents)
                        .set({
                            externalId: agentData.externalId ?? existingByName.externalId,
                            role: agentData.role ?? existingByName.role,
                            personality: agentData.personality ?? existingByName.personality,
                            instructions: agentData.instructions ?? existingByName.instructions,
                            description: agentData.description ?? existingByName.description,
                            agentType: agentData.agentType ?? existingByName.agentType,
                            allowedAgents: agentData.allowedAgents ?? existingByName.allowedAgents,
                            allowedTools: agentData.allowedTools ?? existingByName.allowedTools,
                            llmOptions: agentData.llmOptions ?? existingByName.llmOptions,
                            metadata: agentData.metadata ?? existingByName.metadata,
                        })
                        .where(eq(agents.name, agentData.name))
                        .returning();
                    cache.delete(makeKey('getAllAgents', []));
                    cache.delete(makeKey('getAgentByName', [updated.name]));
                    return updated;
                }
            }
            return this.createAgent(agentData);
        },
        
        // API operations

        /**
         * Create an API
         * @param apiData - The data to create the API with
         * @returns The created API
         */
        async createAPI(apiData: any): Promise<any> {
            // Ensure we only pass fields that exist in the schema
            const cleanApiData = {
                name: apiData.name,
                externalId: apiData.externalId || null,
                description: apiData.description || null,
                openApiSchema: apiData.openApiSchema || null,
                baseUrl: apiData.baseUrl || null,
                headers: apiData.headers || null,
                auth: apiData.auth || null,
                timeout: apiData.timeout || null,
                metadata: apiData.metadata || null,
            };

            const [newAPI] = await db.insert(apis).values(cleanApiData).returning();
            cache.delete(makeKey('getAllAPIs', []));
            cache.delete(makeKey('getAPIByName', [cleanApiData.name]));
            return newAPI;
        },

        /**
         * Get all APIs
         * @returns All APIs
         */
        async getAllAPIs(): Promise<any[]> {
            const cacheKey = makeKey('getAllAPIs', []);
            const cached = getCached(cacheKey);
            if (cached) return cached;
            const rows = await db.select().from(apis);
            return setCached(cacheKey, rows, TTL_LONG);
        },

        /**
         * Get an API by name
         * @param name - The name of the API to get
         * @returns The API
         */

        async getAPIByName(name: string): Promise<any | undefined> {
            const cacheKey = makeKey('getAPIByName', [name]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [api] = await db.select().from(apis).where(eq(apis.name, name)).limit(1);
            return setCached(cacheKey, api, TTL_LONG);
        },

        /**
         * Get an API by external ID
         * @param externalId - The external ID of the API to get
         * @returns The API
         */
        async getAPIByExternalId(externalId: string): Promise<any | undefined> {
            const [api] = await db.select().from(apis).where(eq(apis.externalId, externalId)).limit(1);
            return api;
        },

        /**
         * Upsert an API
         * @param apiData - The data to upsert the API with
         * @returns The upserted API
         */
        async upsertAPI(apiData: any): Promise<any> {
            if (apiData.id) {
                const [existing] = await db.select().from(apis).where(eq(apis.id, apiData.id)).limit(1);
                if (existing) {
                    const [updated] = await db
                        .update(apis)
                        .set({
                            name: apiData.name ?? existing.name,
                            externalId: apiData.externalId ?? existing.externalId,
                            description: apiData.description ?? existing.description,
                            openApiSchema: apiData.openApiSchema ?? existing.openApiSchema,
                            baseUrl: apiData.baseUrl ?? existing.baseUrl,
                            headers: apiData.headers ?? existing.headers,
                            auth: apiData.auth ?? existing.auth,
                            timeout: apiData.timeout ?? existing.timeout,
                            metadata: apiData.metadata ?? existing.metadata,
                        })
                        .where(eq(apis.id, apiData.id))
                        .returning();
                    cache.delete(makeKey('getAllAPIs', []));
                    cache.delete(makeKey('getAPIByName', [updated.name]));
                    return updated;
                }
            }
            if (apiData.name) {
                const [existingByName] = await db.select().from(apis).where(eq(apis.name, apiData.name)).limit(1);
                if (existingByName) {
                    const [updated] = await db
                        .update(apis)
                        .set({
                            externalId: apiData.externalId ?? existingByName.externalId,
                            description: apiData.description ?? existingByName.description,
                            openApiSchema: apiData.openApiSchema ?? existingByName.openApiSchema,
                            baseUrl: apiData.baseUrl ?? existingByName.baseUrl,
                            headers: apiData.headers ?? existingByName.headers,
                            auth: apiData.auth ?? existingByName.auth,
                            timeout: apiData.timeout ?? existingByName.timeout,
                            metadata: apiData.metadata ?? existingByName.metadata,
                        })
                        .where(eq(apis.name, apiData.name))
                        .returning();
                    cache.delete(makeKey('getAllAPIs', []));
                    cache.delete(makeKey('getAPIByName', [updated.name]));
                    return updated;
                }
            }
            return this.createAPI(apiData);
        },

        // Tool operations

        /**
         * Create a tool
         * @param toolData - The data to create the tool with
         * @returns The created tool
         */
        async createTool(toolData: any): Promise<any> {
            const cleanToolData = {
                key: toolData.key,
                name: toolData.name,
                externalId: toolData.externalId || null,
                description: toolData.description || null,
                inputSchema: toolData.inputSchema || null,
                outputSchema: toolData.outputSchema || null,
                metadata: toolData.metadata || null,
            };
            const [newTool] = await db.insert(tools).values(cleanToolData).returning();
            cache.delete(makeKey('getAllTools', []));
            cache.delete(makeKey('getToolByKey', [cleanToolData.key]));
            return newTool;
        },

        /**
         * Get all tools
         * @returns All tools
         */
        async getAllTools(): Promise<any[]> {
            const cacheKey = makeKey('getAllTools', []);
            const cached = getCached(cacheKey);
            if (cached) return cached;
            const rows = await db.select().from(tools);
            return setCached(cacheKey, rows, TTL_LONG);
        },

        /**
         * Get a tool by key
         * @param key - The key of the tool to get
         * @returns The tool
         */
        async getToolByKey(key: string): Promise<any | undefined> {
            const cacheKey = makeKey('getToolByKey', [key]);
            const cached = getCached(cacheKey);
            if (cached !== undefined) return cached;
            const [tool] = await db.select().from(tools).where(eq(tools.key, key)).limit(1);
            return setCached(cacheKey, tool, TTL_LONG);
        },

        /**
         * Get a tool by external ID
         * @param externalId - The external ID of the tool to get
         * @returns The tool
         */
        async getToolByExternalId(externalId: string): Promise<any | undefined> {
            const [tool] = await db.select().from(tools).where(eq(tools.externalId, externalId)).limit(1);
            return tool;
        },

        /**
         * Upsert a tool
         * @param toolData - The data to upsert the tool with
         * @returns The upserted tool
         */
        async upsertTool(toolData: any): Promise<any> {
            // check by id first, then by name
            if (toolData.id) {
                const [existing] = await db.select().from(tools).where(eq(tools.id, toolData.id)).limit(1);
                if (existing) {
                    const [updated] = await db
                        .update(tools)
                        .set({
                            key: toolData.key ?? existing.key,
                            name: toolData.name ?? existing.name,
                            externalId: toolData.externalId ?? existing.externalId,
                            description: toolData.description ?? existing.description,
                            inputSchema: toolData.inputSchema ?? existing.inputSchema,
                            outputSchema: toolData.outputSchema ?? existing.outputSchema,
                            metadata: toolData.metadata ?? existing.metadata,
                        })
                        .where(eq(tools.id, toolData.id))
                        .returning();
                    cache.delete(makeKey('getAllTools', []));
                    cache.delete(makeKey('getToolByKey', [updated.key]));
                    return updated;
                }
            }
            if (toolData.name) {
                const [existingByName] = await db.select().from(tools).where(eq(tools.name, toolData.name)).limit(1);
                if (existingByName) {
                    const [updated] = await db
                        .update(tools)
                        .set({
                            key: toolData.key ?? existingByName.key,
                            externalId: toolData.externalId ?? existingByName.externalId,
                            description: toolData.description ?? existingByName.description,
                            inputSchema: toolData.inputSchema ?? existingByName.inputSchema,
                            outputSchema: toolData.outputSchema ?? existingByName.outputSchema,
                            metadata: toolData.metadata ?? existingByName.metadata,
                        })
                        .where(eq(tools.name, toolData.name))
                        .returning();
                    cache.delete(makeKey('getAllTools', []));
                    cache.delete(makeKey('getToolByKey', [updated.key]));
                    return updated;
                }
            }
            return this.createTool(toolData);
        },

        /**
         * Create an MCP server
         * @param mcpData - The data to create the MCP server with
         * @returns The created MCP server
         */
        // MCP Server operations
        async createMCPServer(mcpData: any): Promise<any> {
            const [newMCPServer] = await db.insert(mcpServers).values(mcpData).returning();
            return newMCPServer;
        },

        /**
         * Get all MCP servers
         * @returns All MCP servers
         */
        async getAllMCPServers(): Promise<any[]> {
            return await db.select().from(mcpServers);
        },

        /**
         * Get an MCP server by name
         * @param name - The name of the MCP server to get
         * @returns The MCP server
         */
        async getMCPServerByName(name: string): Promise<any | undefined> {
            const [mcpServer] = await db.select().from(mcpServers).where(eq(mcpServers.name, name)).limit(1);
            return mcpServer;
        },

        // Users

        /**
         * Upsert a user
         * @param userData - The data to upsert the user with
         * @returns The upserted user
         */
        async upsertUser(userData: any): Promise<any> {
            // match by id, externalId, or email
            let existing: any | undefined;
            if (userData.id) {
                [existing] = await db.select().from(users).where(eq(users.id, userData.id)).limit(1);
            }
            if (!existing && userData.externalId) {
                [existing] = await db.select().from(users).where(eq(users.externalId, userData.externalId)).limit(1);
            }
            if (!existing && userData.email) {
                [existing] = await db.select().from(users).where(eq(users.email, userData.email)).limit(1);
            }
            if (existing) {
                const [updated] = await db
                    .update(users)
                    .set({
                        name: userData.name ?? existing.name,
                        email: userData.email ?? existing.email,
                        externalId: userData.externalId ?? existing.externalId,
                        metadata: userData.metadata ?? existing.metadata,
                    })
                    .where(eq(users.id, existing.id))
                    .returning();
                if (updated.externalId) cache.delete(makeKey('getUserByExternalId', [updated.externalId]));
                return updated;
            }
            const [created] = await db
                .insert(users)
                .values({
                    name: userData.name || null,
                    email: userData.email || null,
                    externalId: userData.externalId || null,
                    metadata: userData.metadata || null,
                })
                .returning();
            if (created.externalId) cache.delete(makeKey('getUserByExternalId', [created.externalId]));
            return created;
        },
        /**
         * Get a user by external ID
         * @param externalId - The external ID of the user to get
         * @returns The user
         */
        async getUserByExternalId(externalId: string): Promise<any | undefined> {
            const [user] = await db.select().from(users).where(eq(users.externalId, externalId)).limit(1);
            return user;
        },
    };
}

export type Operations = ReturnType<typeof createOperations>;