import { threads, messages, tasks, tool_logs, queue, agents, apis, tools, mcpServers } from "./schema.ts";
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
                role: agentData.role,
                personality: agentData.personality || null,
                instructions: agentData.instructions || null,
                description: agentData.description || null,
                agentType: agentData.agentType || "agentic",
                allowedAgents: agentData.allowedAgents || null,
                allowedTools: agentData.allowedTools || null,
                llmOptions: agentData.llmOptions || null
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

        // API operations
        async createAPI(apiData: any): Promise<any> {
            // Ensure we only pass fields that exist in the schema
            const cleanApiData = {
                name: apiData.name,
                description: apiData.description || null,
                openApiSchema: apiData.openApiSchema || null,
                baseUrl: apiData.baseUrl || null,
                headers: apiData.headers || null,
                auth: apiData.auth || null,
                timeout: apiData.timeout || null
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

        // Tool operations
        async createTool(toolData: any): Promise<any> {
            const [newTool] = await db.insert(tools).values(toolData).returning();
            return newTool;
        },

        async getAllTools(): Promise<any[]> {
            return await db.select().from(tools);
        },

        async getToolByKey(key: string): Promise<any | undefined> {
            const [tool] = await db.select().from(tools).where(eq(tools.key, key)).limit(1);
            return tool;
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