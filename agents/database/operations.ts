import { threads, messages, tasks, tool_logs, queue, agents, apis, tools, mcpServers, users } from "./schema.ts";
import { and, eq, desc, or, inArray, sql } from "drizzle-orm";
import { NewMessage, Thread, Message, Task, ToolLog, Queue, NewTask, NewToolLog, NewThread } from "../Interfaces.ts";

/**
 * Database operations factory - creates operation functions bound to a specific database instance
 */
export function createOperations(db: any): any {
    return {
        async getMessageHistory(threadId: string, userId: string, limit: number = 50): Promise<NewMessage[]> {
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

            return result;
        },

        async getThreadById(threadId: string): Promise<Thread | undefined> {
            const [thread] = await db
                .select()
                .from(threads)
                .where(and(
                    eq(threads.id, threadId),
                    eq(threads.status, "active")
                ))
                .limit(1);
            return thread;
        },

        async getThreadByExternalId(externalId: string): Promise<Thread | undefined> {
            const [thread] = await db
                .select()
                .from(threads)
                .where(and(
                    eq(threads.externalId, externalId),
                    eq(threads.status, "active")
                ))
                .limit(1);
            return thread;
        },

        async getTaskById(taskId: string): Promise<Task | undefined> {
            const [task] = await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, taskId))
                .limit(1);
            return task;
        },

        async createMessage(message: NewMessage): Promise<Message> {
            const [newMessage] = await db.insert(messages).values(message).returning();
            return newMessage;
        },

        async createToolLogs(logs: NewToolLog[]): Promise<void> {
            if (logs.length > 0) {
                await db.insert(tool_logs).values(logs as any);
            }
        },

        async addToQueue(threadId: string, message: NewMessage): Promise<Queue> {
            const [newQueueItem] = await db.insert(queue).values({ threadId, message }).returning();
            return newQueueItem;
        },

        async getProcessingQueueItem(threadId: string): Promise<Queue | undefined> {
            const [item] = await db
                .select()
                .from(queue)
                .where(and(eq(queue.threadId, threadId), eq(queue.status, "processing")))
                .limit(1);
            return item;
        },

        async getThreadByIdRegardlessOfStatus(threadId: string): Promise<Thread | undefined> {
            const [thread] = await db
                .select()
                .from(threads)
                .where(eq(threads.id, threadId))
                .limit(1);
            return thread;
        },

        async getNextPendingQueueItem(threadId: string): Promise<Queue | undefined> {
            const [item] = await db
                .select()
                .from(queue)
                .where(and(eq(queue.threadId, threadId), eq(queue.status, "pending")))
                .orderBy(desc(queue.createdAt))
                .limit(1);
            return item;
        },

        async updateQueueItemStatus(queueId: string, status: "processing" | "completed" | "failed"): Promise<void> {
            await db.update(queue).set({ status }).where(eq(queue.id, queueId));
        },

        async findOrCreateThread(threadId: string, threadData: NewThread): Promise<Thread> {
            let [thread]: Thread[] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
            if (!thread) {
                [thread] = await db.insert(threads).values({ id: threadId, ...threadData }).returning();
            }
            return thread;
        },

        async archiveThread(threadId: string, summary: string): Promise<Thread[]> {
            return await db
                .update(threads)
                .set({ status: "archived", summary })
                .where(eq(threads.id, threadId))
                .returning();
        },

        async createTask(taskData: NewTask): Promise<Task> {
            const [newTask] = await db.insert(tasks).values(taskData).returning();
            return newTask;
        },

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
            return newAgent;
        },

        async getAllAgents(): Promise<any[]> {
            return await db.select().from(agents);
        },

        async getAgentByName(name: string): Promise<any | undefined> {
            const [agent] = await db.select().from(agents).where(eq(agents.name, name)).limit(1);
            return agent;
        },

        async getAgentByExternalId(externalId: string): Promise<any | undefined> {
            const [agent] = await db.select().from(agents).where(eq(agents.externalId, externalId)).limit(1);
            return agent;
        },

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
                    return updated;
                }
            }
            return this.createAgent(agentData);
        },

        // API operations
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
            return newAPI;
        },

        async getAllAPIs(): Promise<any[]> {
            return await db.select().from(apis);
        },

        async getAPIByName(name: string): Promise<any | undefined> {
            const [api] = await db.select().from(apis).where(eq(apis.name, name)).limit(1);
            return api;
        },

        async getAPIByExternalId(externalId: string): Promise<any | undefined> {
            const [api] = await db.select().from(apis).where(eq(apis.externalId, externalId)).limit(1);
            return api;
        },

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
                    return updated;
                }
            }
            return this.createAPI(apiData);
        },

        // Tool operations
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
            return newTool;
        },

        async getAllTools(): Promise<any[]> {
            return await db.select().from(tools);
        },

        async getToolByKey(key: string): Promise<any | undefined> {
            const [tool] = await db.select().from(tools).where(eq(tools.key, key)).limit(1);
            return tool;
        },

        async getToolByExternalId(externalId: string): Promise<any | undefined> {
            const [tool] = await db.select().from(tools).where(eq(tools.externalId, externalId)).limit(1);
            return tool;
        },

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
                    return updated;
                }
            }
            return this.createTool(toolData);
        },

        // MCP Server operations
        async createMCPServer(mcpData: any): Promise<any> {
            const [newMCPServer] = await db.insert(mcpServers).values(mcpData).returning();
            return newMCPServer;
        },

        async getAllMCPServers(): Promise<any[]> {
            return await db.select().from(mcpServers);
        },

        async getMCPServerByName(name: string): Promise<any | undefined> {
            const [mcpServer] = await db.select().from(mcpServers).where(eq(mcpServers.name, name)).limit(1);
            return mcpServer;
        },

        // Users
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
        async getUserByExternalId(externalId: string): Promise<any | undefined> {
            const [user] = await db.select().from(users).where(eq(users.externalId, externalId)).limit(1);
            return user;
        },
    };
}

/**
 * Operations type for better TypeScript support
 */
export type Operations = ReturnType<typeof createOperations>;

// Legacy exports for backward compatibility (these still require db parameter)
export async function getMessageHistory(db: any, threadId: string, userId: string, limit: number = 50): Promise<NewMessage[]> {
    return createOperations(db).getMessageHistory(threadId, userId, limit);
}

export async function getThreadById(db: any, threadId: string): Promise<Thread | undefined> {
    return createOperations(db).getThreadById(threadId);
}

export async function getTaskById(db: any, taskId: string): Promise<Task | undefined> {
    return createOperations(db).getTaskById(taskId);
}

export async function createMessage(db: any, message: NewMessage): Promise<Message> {
    return createOperations(db).createMessage(message);
}

export async function createToolLogs(db: any, logs: NewToolLog[]): Promise<void> {
    return createOperations(db).createToolLogs(logs);
}

export async function addToQueue(db: any, threadId: string, message: NewMessage): Promise<Queue> {
    return createOperations(db).addToQueue(threadId, message);
}

export async function getProcessingQueueItem(db: any, threadId: string): Promise<Queue | undefined> {
    return createOperations(db).getProcessingQueueItem(threadId);
}

export async function getThreadByIdRegardlessOfStatus(db: any, threadId: string): Promise<Thread | undefined> {
    return createOperations(db).getThreadByIdRegardlessOfStatus(threadId);
}

export async function getNextPendingQueueItem(db: any, threadId: string): Promise<Queue | undefined> {
    return createOperations(db).getNextPendingQueueItem(threadId);
}

export async function updateQueueItemStatus(db: any, queueId: string, status: "processing" | "completed" | "failed"): Promise<void> {
    return createOperations(db).updateQueueItemStatus(queueId, status);
}

export async function findOrCreateThread(db: any, threadId: string, threadData: NewThread): Promise<Thread> {
    return createOperations(db).findOrCreateThread(threadId, threadData);
}

export async function archiveThread(db: any, threadId: string, summary: string): Promise<Thread[]> {
    return createOperations(db).archiveThread(threadId, summary);
}

export async function createTask(db: any, taskData: NewTask): Promise<Task> {
    return createOperations(db).createTask(taskData);
}

// Legacy exports for agent operations
export async function createAgent(db: any, agentData: any): Promise<any> {
    return createOperations(db).createAgent(agentData);
}

export async function getAllAgents(db: any): Promise<any[]> {
    return createOperations(db).getAllAgents();
}

export async function getAgentByName(db: any, name: string): Promise<any | undefined> {
    return createOperations(db).getAgentByName(name);
}

export async function getAgentByExternalId(db: any, externalId: string): Promise<any | undefined> {
    return createOperations(db).getAgentByExternalId(externalId);
}

export async function upsertAgent(db: any, agentData: any): Promise<any> {
    return createOperations(db).upsertAgent(agentData);
}

// Legacy exports for API operations
export async function createAPI(db: any, apiData: any): Promise<any> {
    return createOperations(db).createAPI(apiData);
}

export async function getAllAPIs(db: any): Promise<any[]> {
    return createOperations(db).getAllAPIs();
}

export async function getAPIByName(db: any, name: string): Promise<any | undefined> {
    return createOperations(db).getAPIByName(name);
}

export async function getAPIByExternalId(db: any, externalId: string): Promise<any | undefined> {
    return createOperations(db).getAPIByExternalId(externalId);
}

export async function upsertAPI(db: any, apiData: any): Promise<any> {
    return createOperations(db).upsertAPI(apiData);
}

// Legacy exports for tool operations
export async function createTool(db: any, toolData: any): Promise<any> {
    return createOperations(db).createTool(toolData);
}

export async function getAllTools(db: any): Promise<any[]> {
    return createOperations(db).getAllTools();
}

export async function getToolByKey(db: any, key: string): Promise<any | undefined> {
    return createOperations(db).getToolByKey(key);
}

export async function getToolByExternalId(db: any, externalId: string): Promise<any | undefined> {
    return createOperations(db).getToolByExternalId(externalId);
}
export async function upsertTool(db: any, toolData: any): Promise<any> {
    return createOperations(db).upsertTool(toolData);
}

export async function upsertUser(db: any, userData: any): Promise<any> {
    return createOperations(db).upsertUser(userData);
}

export async function getUserByExternalId(db: any, externalId: string): Promise<any | undefined> {
    return createOperations(db).getUserByExternalId(externalId);
}

// Legacy exports for MCP server operations
export async function createMCPServer(db: any, mcpData: any): Promise<any> {
    return createOperations(db).createMCPServer(mcpData);
}

export async function getAllMCPServers(db: any): Promise<any[]> {
    return createOperations(db).getAllMCPServers();
}

export async function getMCPServerByName(db: any, name: string): Promise<any | undefined> {
    return createOperations(db).getMCPServerByName(name);
} 