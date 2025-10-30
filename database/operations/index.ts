import { queue, threads, messages, tasks, agents, apis, tools, mcpServers, users } from "../schemas/index.ts";
import type { NewMessage, Thread, Message, Task, NewTask, NewThread, Queue, Agent, NewAgent, API, NewAPI, Tool, NewTool, MCPServer, NewMCPServer, User, NewUser } from "../schemas/index.ts";
import type { DbInstance } from "../index.ts";

/**
 * Database operations factory - creates operation functions bound to a specific database instance
 */
export function createOperations(db: DbInstance) {

    const MAX_EXPIRED_CLEANUP_BATCH = 100;
    const EXPIRED_RETENTION_INTERVAL = "1 day";

    const cleanupExpiredQueueItems = async (): Promise<void> => {
        await db.queryRaw(
            `DELETE FROM queue
             WHERE id IN (
                SELECT id FROM queue
                WHERE status = 'expired'
                  AND expires_at IS NOT NULL
                  AND expires_at < NOW() - INTERVAL '${EXPIRED_RETENTION_INTERVAL}'
                LIMIT ${MAX_EXPIRED_CLEANUP_BATCH}
             )`
        );
    };

    const markQueueItemExpired = async (queueId: string): Promise<void> => {
        await db.queryRaw(
            `UPDATE queue
             SET status = 'expired',
                 expires_at = COALESCE(expires_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1`,
            [queueId]
        );
        await cleanupExpiredQueueItems();
    };

    return {
        /** Queue operations 
         * 
         * @param threadId - The thread ID to add the event to
         * @param event - The event to add to the queue
         * @returns The new queue item
         */
        async addToQueue(threadId: string, event: {
            eventType: string;
            payload: Queue["payload"];
            parentEventId?: string;
            traceId?: string;
            priority?: number;
            metadata?: Queue["metadata"] | undefined;
            ttlMs?: number;
            expiresAt?: Date | string | null;
            status?: Queue["status"];
        }): Promise<Queue> {
            const now = Date.now();
            const ttlMs = typeof event.ttlMs === "number" && event.ttlMs > 0 ? Math.floor(event.ttlMs) : null;

            let expiresAt: Date | null = null;
            if (event.expiresAt) {
                expiresAt = new Date(event.expiresAt);
            } else if (ttlMs) {
                expiresAt = new Date(now + ttlMs);
            }

            const [newQueueItem] = await db.insert(queue).values({
                threadId,
                eventType: event.eventType,
                payload: event.payload,
                parentEventId: event.parentEventId || null,
                traceId: event.traceId || null,
                priority: event.priority || null,
                ttlMs,
                expiresAt,
                status: event.status || 'pending',
                metadata: event.metadata ?? null,
            }).returning();

            await cleanupExpiredQueueItems();
            return newQueueItem;
        },
        /**
         * Get the processing queue item for a given thread
         * @param threadId - The thread ID to get the processing queue item for
         * @returns The processing queue item
         */
        async getProcessingQueueItem(threadId: string): Promise<Queue | undefined> {
            const item = await db.query.queue.findFirst({
                where: (q, { eq, and }) => and(eq(q.threadId, threadId), eq(q.status, "processing")),
            });
            return item;
        },

        /**
         * Get the next pending queue item for a given thread
         * @param threadId - The thread ID to get the next pending queue item for
         * @returns The next pending queue item
         */
        async getNextPendingQueueItem(threadId: string): Promise<Queue | undefined> {
            while (true) {
                const item = await db.query.queue.findFirst({
                    where: (q, { eq, and }) => and(eq(q.threadId, threadId), eq(q.status, "pending")),
                    orderBy: (q, { desc, asc, sql }) => [
                        desc(sql`COALESCE(${q.priority}, 0)`),
                        asc(q.createdAt),
                        asc(q.id)
                    ],
                });

                if (!item) {
                    await cleanupExpiredQueueItems();
                    return undefined;
                }

                if (item.expiresAt) {
                    const expiresAtValue = item.expiresAt instanceof Date
                        ? item.expiresAt.getTime()
                        : new Date(item.expiresAt).getTime();

                    if (!Number.isNaN(expiresAtValue) && expiresAtValue <= Date.now()) {
                        await markQueueItemExpired(item.id);
                        continue;
                    }
                }

                return item;
            }
        },

        /**
         * Update the status of a queue item
         * @param queueId - The ID of the queue item to update
         * @param status - The new status of the queue item
         */
        async updateQueueItemStatus(queueId: string, status: "processing" | "completed" | "failed" | "expired" | "overwritten"): Promise<void> {
            await db.queryRaw(`UPDATE queue SET status = $1, updated_at = NOW() WHERE id = $2`, [status, queueId]);
        },
        /**
         * Get the message history for a given thread and user
         * @param threadId - The thread ID to get the message history for
         * @param userId - The user ID to get the message history for
         * @param limit - The maximum number of messages to return
         * @returns The message history
         */
        async getMessageHistory(threadId: string, userId: string, limit: number = 50): Promise<NewMessage[]> {
            const allMessages: (Message & { threadLevel: number })[] = [];
            let currentThreadId: string | null = threadId;
            let threadLevel = 0;

            while (currentThreadId) {
                const thread: Thread | undefined = await db.query.threads.findFirst({
                    where: (t, { eq, and, sql }) => and(
                        eq(t.id, currentThreadId),
                        eq(t.status, "active"),
                        sql`${t.participants} ? ${userId}`
                    ),
                });

                if (!thread) {
                    break;
                }

                const threadMessages: Message[] = await db.query.messages.findMany({
                    where: (m, { eq }) => eq(m.threadId, currentThreadId),
                });

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
            const result = allMessages.slice(-limit).map(({ threadLevel: _threadLevel, ...msg }) => msg);
            return result;
        },

        /**
         * Get a thread by ID
         * @param threadId - The ID of the thread to get
         * @returns The thread
         */
        async getThreadById(threadId: string): Promise<Thread | undefined> {
            const thread = await db.query.threads.findFirst({
                where: (t, { eq, and }) => and(
                    eq(t.id, threadId),
                    eq(t.status, "active")
                ),
            });
            return thread;
        },

        /**
         * Get a thread by external ID
         * @param externalId - The external ID of the thread to get
         * @returns The thread
         */
        async getThreadByExternalId(externalId: string): Promise<Thread | undefined> {
            const thread = await db.query.threads.findFirst({
                where: (t, { eq, and }) => and(
                    eq(t.externalId, externalId),
                    eq(t.status, "active")
                ),
            });
            return thread;
        },

        /**
         * Get a thread by ID regardless of status
         * @param threadId - The ID of the thread to get
         * @returns The thread
         */
        async getThreadByIdRegardlessOfStatus(threadId: string): Promise<Thread | undefined> {
            const thread = await db.query.threads.findFirst({
                where: (t, { eq }) => eq(t.id, threadId),
            });
            return thread;
        },

        /**
         * Get a task by ID
         * @param taskId - The ID of the task to get
         * @returns The task
         */
        async getTaskById(taskId: string): Promise<Task | undefined> {
            const task = await db.query.tasks.findFirst({
                where: (t, { eq }) => eq(t.id, taskId),
            });
            return task;
        },

        /**
         * Create a message
         * @param message - The message to create
         * @returns The created message
         */
        async createMessage(message: NewMessage): Promise<Message> {
            const [newMessage] = await db.insert(messages).values(message).returning();
            return newMessage;
        },

        /**
         * Find or create a thread
         * @param threadId - The ID of the thread to find or create
         * @param threadData - The data to create the thread with
         * @returns The created thread
         */
        async findOrCreateThread(threadId: string, threadData: NewThread): Promise<Thread> {
            let thread = await db.query.threads.findFirst({
                where: (t, { eq }) => eq(t.id, threadId),
            });

            if (!thread) {
                const participants = Array.isArray(threadData.participants)
                    ? Array.from(new Set(threadData.participants))
                    : threadData.participants;

                const metadata = threadData.metadata !== undefined ? threadData.metadata : null;

                [thread] = await db.insert(threads).values({
                    id: threadId,
                    ...threadData,
                    participants,
                    metadata,
                }).returning();
                return thread;
            }

            const updates: string[] = [];
            const params: unknown[] = [];

            if (Array.isArray(threadData.participants) && threadData.participants.length > 0) {
                const existing = Array.isArray(thread.participants) ? thread.participants : [];
                const incoming = Array.from(new Set(threadData.participants));

                const participantsChanged = JSON.stringify(existing) !== JSON.stringify(incoming);

                if (participantsChanged) {
                    updates.push(`participants = $${updates.length + 1}`);
                    params.push(JSON.stringify(incoming));
                }
            }

            if (threadData.metadata !== undefined) {
                const incomingMetadata = threadData.metadata;
                const existingMetadata = thread.metadata ?? null;
                const metadataChanged = JSON.stringify(existingMetadata) !== JSON.stringify(incomingMetadata);

                if (metadataChanged) {
                    updates.push(`metadata = $${updates.length + 1}`);
                    params.push(incomingMetadata === null ? null : JSON.stringify(incomingMetadata));
                }
            }

            if (updates.length > 0) {
                const setClause = `${updates.join(', ')}, updated_at = NOW()`;
                const result = await db.queryRaw(
                    `UPDATE threads SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
                    [...params, threadId]
                );
                thread = result.rows[0] as Thread;
            }

            return thread;
        },

        /**
         * Archive a thread
         * @param threadId - The ID of the thread to archive
         * @param summary - The summary of the thread
         * @returns The archived thread
         */
        async archiveThread(threadId: string, summary: string): Promise<Thread[]> {
            const result = await db.queryRaw(
                `UPDATE threads SET status = 'archived', summary = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [summary, threadId]
            );
            return result.rows as Thread[];
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
        async createAgent(agentData: NewAgent): Promise<Agent> {
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
            return newAgent;
        },

        /**
         * Get all agents
         * @returns All agents
         */
        async getAllAgents(): Promise<Agent[]> {
            const rows = await db.query.agents.findMany();
            return rows;
        },

        /**
         * Get an agent by name
         * @param name - The name of the agent to get
         * @returns The agent
         */
        async getAgentByName(name: string): Promise<Agent | undefined> {
            const agent = await db.query.agents.findFirst({
                where: (a, { eq }) => eq(a.name, name),
            });
            return agent;
        },

        /**
         * Get an agent by external ID
         * @param externalId - The external ID of the agent to get
         * @returns The agent
         */
        async getAgentByExternalId(externalId: string): Promise<Agent | undefined> {
            const agent = await db.query.agents.findFirst({
                where: (a, { eq }) => eq(a.externalId, externalId),
            });
            return agent;
        },

        /**
         * Upsert an agent
         * @param agentData - The data to upsert the agent with
         * @returns The upserted agent
         */
        async upsertAgent(agentData: Partial<NewAgent> & { id?: string; name?: string }): Promise<Agent> {
            // Prefer id, then name
            if (agentData.id) {
                const existing = await db.query.agents.findFirst({
                    where: (a, { eq }) => eq(a.id, agentData.id),
                });
                if (existing) {
                    const result = await db.queryRaw(
                        `UPDATE agents SET name = $1, external_id = $2, role = $3, personality = $4, instructions = $5, description = $6, agent_type = $7, allowed_agents = $8, allowed_tools = $9, llm_options = $10, metadata = $11, updated_at = NOW() WHERE id = $12 RETURNING *`,
                        [
                            agentData.name ?? existing.name,
                            agentData.externalId ?? existing.externalId,
                            agentData.role ?? existing.role,
                            agentData.personality ?? existing.personality,
                            agentData.instructions ?? existing.instructions,
                            agentData.description ?? existing.description,
                            agentData.agentType ?? existing.agentType,
                            JSON.stringify(agentData.allowedAgents ?? existing.allowedAgents),
                            JSON.stringify(agentData.allowedTools ?? existing.allowedTools),
                            JSON.stringify(agentData.llmOptions ?? existing.llmOptions),
                            JSON.stringify(agentData.metadata ?? existing.metadata),
                            agentData.id
                        ]
                    );
                    const updated = result.rows[0] as Agent;
                    return updated;
                }
            }
            if (agentData.name) {
                const existingByName = await db.query.agents.findFirst({
                    where: (a, { eq }) => eq(a.name, agentData.name),
                });
                if (existingByName) {
                    const result = await db.queryRaw(
                        `UPDATE agents SET external_id = $1, role = $2, personality = $3, instructions = $4, description = $5, agent_type = $6, allowed_agents = $7, allowed_tools = $8, llm_options = $9, metadata = $10, updated_at = NOW() WHERE name = $11 RETURNING *`,
                        [
                            agentData.externalId ?? existingByName.externalId,
                            agentData.role ?? existingByName.role,
                            agentData.personality ?? existingByName.personality,
                            agentData.instructions ?? existingByName.instructions,
                            agentData.description ?? existingByName.description,
                            agentData.agentType ?? existingByName.agentType,
                            JSON.stringify(agentData.allowedAgents ?? existingByName.allowedAgents),
                            JSON.stringify(agentData.allowedTools ?? existingByName.allowedTools),
                            JSON.stringify(agentData.llmOptions ?? existingByName.llmOptions),
                            JSON.stringify(agentData.metadata ?? existingByName.metadata),
                            agentData.name
                        ]
                    );
                    const updated = result.rows[0] as Agent;
                    return updated;
                }
            }
            return this.createAgent(agentData as NewAgent);
        },

        // API operations

        /**
         * Create an API
         * @param apiData - The data to create the API with
         * @returns The created API
         */
        async createAPI(apiData: NewAPI): Promise<API> {
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
            return newAPI;
        },

        /**
         * Get all APIs
         * @returns All APIs
         */
        async getAllAPIs(): Promise<API[]> {
            const rows = await db.query.apis.findMany();
            return rows;
        },

        /**
         * Get an API by name
         * @param name - The name of the API to get
         * @returns The API
         */

        async getAPIByName(name: string): Promise<API | undefined> {
            const api = await db.query.apis.findFirst({
                where: (a, { eq }) => eq(a.name, name),
            });
            return api;
        },

        /**
         * Get an API by external ID
         * @param externalId - The external ID of the API to get
         * @returns The API
         */
        async getAPIByExternalId(externalId: string): Promise<API | undefined> {
            const api = await db.query.apis.findFirst({
                where: (a, { eq }) => eq(a.externalId, externalId),
            });
            return api;
        },

        /**
         * Upsert an API
         * @param apiData - The data to upsert the API with
         * @returns The upserted API
         */
        async upsertAPI(apiData: Partial<NewAPI> & { id?: string; name?: string }): Promise<API> {
            if (apiData.id) {
                const existing = await db.query.apis.findFirst({
                    where: (a, { eq }) => eq(a.id, apiData.id),
                });
                if (existing) {
                    const result = await db.queryRaw(
                        `UPDATE apis SET name = $1, external_id = $2, description = $3, open_api_schema = $4, base_url = $5, headers = $6, auth = $7, timeout = $8, metadata = $9, updated_at = NOW() WHERE id = $10 RETURNING *`,
                        [
                            apiData.name ?? existing.name,
                            apiData.externalId ?? existing.externalId,
                            apiData.description ?? existing.description,
                            JSON.stringify(apiData.openApiSchema ?? existing.openApiSchema),
                            apiData.baseUrl ?? existing.baseUrl,
                            JSON.stringify(apiData.headers ?? existing.headers),
                            JSON.stringify(apiData.auth ?? existing.auth),
                            apiData.timeout ?? existing.timeout,
                            JSON.stringify(apiData.metadata ?? existing.metadata),
                            apiData.id
                        ]
                    );
                    const updated = result.rows[0] as API;
                    return updated;
                }
            }
            if (apiData.name) {
                const existingByName = await db.query.apis.findFirst({
                    where: (a, { eq }) => eq(a.name, apiData.name),
                });
                if (existingByName) {
                    const result = await db.queryRaw(
                        `UPDATE apis SET external_id = $1, description = $2, open_api_schema = $3, base_url = $4, headers = $5, auth = $6, timeout = $7, metadata = $8, updated_at = NOW() WHERE name = $9 RETURNING *`,
                        [
                            apiData.externalId ?? existingByName.externalId,
                            apiData.description ?? existingByName.description,
                            JSON.stringify(apiData.openApiSchema ?? existingByName.openApiSchema),
                            apiData.baseUrl ?? existingByName.baseUrl,
                            JSON.stringify(apiData.headers ?? existingByName.headers),
                            JSON.stringify(apiData.auth ?? existingByName.auth),
                            apiData.timeout ?? existingByName.timeout,
                            JSON.stringify(apiData.metadata ?? existingByName.metadata),
                            apiData.name
                        ]
                    );
                    const updated = result.rows[0] as API;
                    return updated;
                }
            }
            return this.createAPI(apiData as NewAPI);
        },

        // Tool operations

        /**
         * Create a tool
         * @param toolData - The data to create the tool with
         * @returns The created tool
         */
        async createTool(toolData: NewTool): Promise<Tool> {
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
            return newTool;
        },

        /**
         * Get all tools
         * @returns All tools
         */
        async getAllTools(): Promise<Tool[]> {
            const rows = await db.query.tools.findMany();
            return rows;
        },

        /**
         * Get a tool by key
         * @param key - The key of the tool to get
         * @returns The tool
         */
        async getToolByKey(key: string): Promise<Tool | undefined> {
            const tool = await db.query.tools.findFirst({
                where: (t, { eq }) => eq(t.key, key),
            });
            return tool;
        },

        /**
         * Get a tool by external ID
         * @param externalId - The external ID of the tool to get
         * @returns The tool
         */
        async getToolByExternalId(externalId: string): Promise<Tool | undefined> {
            const tool = await db.query.tools.findFirst({
                where: (t, { eq }) => eq(t.externalId, externalId),
            });
            return tool;
        },

        /**
         * Upsert a tool
         * @param toolData - The data to upsert the tool with
         * @returns The upserted tool
         */
        async upsertTool(toolData: Partial<NewTool> & { id?: string; name?: string }): Promise<Tool> {
            // check by id first, then by name
            if (toolData.id) {
                const existing = await db.query.tools.findFirst({
                    where: (t, { eq }) => eq(t.id, toolData.id),
                });
                if (existing) {
                    const result = await db.queryRaw(
                        `UPDATE tools SET key = $1, name = $2, external_id = $3, description = $4, input_schema = $5, output_schema = $6, metadata = $7, updated_at = NOW() WHERE id = $8 RETURNING *`,
                        [
                            toolData.key ?? existing.key,
                            toolData.name ?? existing.name,
                            toolData.externalId ?? existing.externalId,
                            toolData.description ?? existing.description,
                            JSON.stringify(toolData.inputSchema ?? existing.inputSchema),
                            JSON.stringify(toolData.outputSchema ?? existing.outputSchema),
                            JSON.stringify(toolData.metadata ?? existing.metadata),
                            toolData.id
                        ]
                    );
                    const updated = result.rows[0] as Tool;
                    return updated;
                }
            }
            if (toolData.name) {
                const existingByName = await db.query.tools.findFirst({
                    where: (t, { eq }) => eq(t.name, toolData.name),
                });
                if (existingByName) {
                    const result = await db.queryRaw(
                        `UPDATE tools SET key = $1, external_id = $2, description = $3, input_schema = $4, output_schema = $5, metadata = $6, updated_at = NOW() WHERE name = $7 RETURNING *`,
                        [
                            toolData.key ?? existingByName.key,
                            toolData.externalId ?? existingByName.externalId,
                            toolData.description ?? existingByName.description,
                            JSON.stringify(toolData.inputSchema ?? existingByName.inputSchema),
                            JSON.stringify(toolData.outputSchema ?? existingByName.outputSchema),
                            JSON.stringify(toolData.metadata ?? existingByName.metadata),
                            toolData.name
                        ]
                    );
                    const updated = result.rows[0] as Tool;
                    return updated;
                }
            }
            return this.createTool(toolData as NewTool);
        },

        /**
         * Create an MCP server
         * @param mcpData - The data to create the MCP server with
         * @returns The created MCP server
         */
        // MCP Server operations
        async createMCPServer(mcpData: NewMCPServer): Promise<MCPServer> {
            const [newMCPServer] = await db.insert(mcpServers).values(mcpData).returning();
            return newMCPServer;
        },

        /**
         * Get all MCP servers
         * @returns All MCP servers
         */
        async getAllMCPServers(): Promise<MCPServer[]> {
            return await db.query.mcpServers.findMany();
        },

        /**
         * Get an MCP server by name
         * @param name - The name of the MCP server to get
         * @returns The MCP server
         */
        async getMCPServerByName(name: string): Promise<MCPServer | undefined> {
            const mcpServer = await db.query.mcpServers.findFirst({
                where: (m, { eq }) => eq(m.name, name),
            });
            return mcpServer;
        },

        // Users

        /**
         * Upsert a user
         * @param userData - The data to upsert the user with
         * @returns The upserted user
         */
        async upsertUser(userData: Partial<NewUser> & { id?: string; externalId?: string; email?: string }): Promise<User> {
            // match by id, externalId, or email
            let existing: User | undefined;
            if (userData.id) {
                existing = await db.query.users.findFirst({
                    where: (u, { eq }) => eq(u.id, userData.id),
                });
            }
            if (!existing && userData.externalId) {
                existing = await db.query.users.findFirst({
                    where: (u, { eq }) => eq(u.externalId, userData.externalId),
                });
            }
            if (!existing && userData.email) {
                existing = await db.query.users.findFirst({
                    where: (u, { eq }) => eq(u.email, userData.email),
                });
            }
            if (existing) {
                const result = await db.queryRaw(
                    `UPDATE users SET name = $1, email = $2, external_id = $3, metadata = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
                    [
                        userData.name ?? existing.name,
                        userData.email ?? existing.email,
                        userData.externalId ?? existing.externalId,
                        JSON.stringify(userData.metadata ?? existing.metadata),
                        existing.id
                    ]
                );
                const updated = result.rows[0] as User;
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
            return created;
        },
        /**
         * Get a user by external ID
         * @param externalId - The external ID of the user to get
         * @returns The user
         */
        async getUserByExternalId(externalId: string): Promise<User | undefined> {
            const user = await db.query.users.findFirst({
                where: (u, { eq }) => eq(u.externalId, externalId),
            });
            return user;
        },
    };
}
export type Operations = ReturnType<typeof createOperations>;