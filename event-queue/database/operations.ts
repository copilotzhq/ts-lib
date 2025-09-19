import { queue } from "./schema.ts";
import { and, eq, asc, desc, sql } from "../../db/drizzle.ts";
import type { Queue } from "../Interfaces.ts";


export const createOperations = (db: any) => {
    return {

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

        async getProcessingQueueItem(threadId: string): Promise<Queue | undefined> {
            const [item] = await db
                .select()
                .from(queue)
                .where(and(eq(queue.threadId, threadId), eq(queue.status, "processing")))
                .limit(1);
            return item;
        },

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

        async updateQueueItemStatus(queueId: string, status: "processing" | "completed" | "failed"): Promise<void> {
            await db.update(queue).set({ status }).where(eq(queue.id, queueId));
        },
    };
};

/**
 * Operations type for better TypeScript support
 */
export type Operations = ReturnType<typeof createOperations>;
