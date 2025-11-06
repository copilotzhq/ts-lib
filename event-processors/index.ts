// Import Database
import { createDatabase, type CopilotzDb } from "@/database/index.ts";

// Import Agent Interfaces  
import type { Thread, Event, NewEvent } from "@/interfaces/index.ts";

// Import Processors
import { llmCallProcessor } from "./llm_call/index.ts";
import { messageProcessor } from "./new_message/index.ts";
import { toolCallProcessor } from "./tool_call/index.ts";

// Internal Event Types
type EventType = Event["type"];

// Typed Event Payloads
import type { LLMCallPayload, LLMResultPayload } from "./llm_call/index.ts";
import type { ToolCallPayload, ToolResultPayload, ToolExecutionContext } from "./tool_call/index.ts";
import type { MessagePayload } from "./new_message/index.ts";
import type { ChatContext } from "@/interfaces/index.ts";

export type { LLMCallPayload, LLMResultPayload, ToolCallPayload, ToolResultPayload, MessagePayload, ToolExecutionContext };

export interface ProcessResult {
    producedEvents: NewEvent[];
}

export type ProcessorDeps = {
    db: CopilotzDb;
    thread: Thread;
    context: ChatContext;
}

type Operations = CopilotzDb["operations"];

type EventProcessors = Record<EventType, EventProcessor<unknown, ProcessorDeps>>;

// Processor registry
const processors: EventProcessors = {
    LLM_CALL: llmCallProcessor,
    NEW_MESSAGE: messageProcessor,
    TOOL_CALL: toolCallProcessor,
};

// Public API
export async function enqueueEvent(db: CopilotzDb, event: NewEvent): Promise<void> {
    const ops = db.operations;
    await ops.addToQueue(event.threadId, {
        eventType: event.type,
        payload: event.payload,
        parentEventId: event.parentEventId ?? undefined,
        traceId: event.traceId ?? undefined,
        priority: event.priority ?? undefined,
        metadata: (event.metadata ?? undefined),
        ttlMs: event.ttlMs ?? undefined,
        status: event.status ?? undefined,
    });
}

export async function startThreadEventWorker(
    db: CopilotzDb,
    threadId: string,
    context: ChatContext
): Promise<void> {
    const workerContext: WorkerContext = context.callbacks?.onEvent
        ? { callbacks: { onEvent: context.callbacks.onEvent } }
        : {};

    await startEventWorker<ProcessorDeps>(
        db,
        threadId,
        workerContext,
        processors,
        async (ops: Operations, event: Event) => {
            const thread = await ops.getThreadById(event.threadId);
            if (!thread) throw new Error(`Thread not found: ${event.threadId}`);
            return { ops, db, thread, context } as ProcessorDeps;
        }
    );
}

export interface EventProcessor<TPayload = unknown, TDeps = unknown> {
    shouldProcess: (event: Event, deps: TDeps) => boolean | Promise<boolean>;
    process: (event: Event, deps: TDeps) => Promise<{ producedEvents?: NewEvent[] } | void> | { producedEvents?: NewEvent[] } | void;
}

export type OnEventResponse =
    | void
    | { event: Event }
    | { producedEvents: NewEvent[] }
    | { drop: true };

export interface WorkerContext {
    callbacks?: {
        onEvent?: (ev: Event) => Promise<{ producedEvents?: NewEvent[] } | void> | { producedEvents?: NewEvent[] } | void;
    };
}

// Generic worker
export async function startEventWorker<TDeps>(
    db: CopilotzDb,
    threadId: string,
    context: WorkerContext,
    processors: Record<string, EventProcessor<unknown, TDeps>>,
    buildDeps: (ops: Operations, event: Event, context: WorkerContext) => Promise<TDeps> | TDeps,
    shouldAcceptEvent?: (event: Event) => boolean
): Promise<void> {

    const dbInstance = db || await createDatabase({});

    const ops = dbInstance.operations as Operations;

    const processing = await ops.getProcessingQueueItem(threadId);

    if (processing) return;

    while (true) {

        const next = await ops.getNextPendingQueueItem(threadId);

        if (!next) break;

        const event: Event = {
            id: next.id,
            threadId: next.threadId,
            type: next.eventType,
            payload: next.payload,
            parentEventId: next.parentEventId,
            traceId: next.traceId,
            priority: next.priority,
            metadata: next.metadata,
            ttlMs: next.ttlMs,
            expiresAt: next.expiresAt,
            createdAt: next.createdAt,
            updatedAt: next.updatedAt,
            status: next.status,
        };

        if (typeof shouldAcceptEvent === 'function' && !shouldAcceptEvent(event)) {
            // Let another domain worker process this event
            break;
        }

        await ops.updateQueueItemStatus(next.id, "processing");

        try {
            const deps = await buildDeps(ops, event, context);

            const processor = processors[event.type];

            // Buckets to respect override semantics
            const preEvents: NewEvent[] = [];
            let finalEvents: NewEvent[] = [];

            // 1) onEvent callback with override semantics
            const handler = context?.callbacks?.onEvent;
            let overriddenByOnEvent = false;
            if (handler) {
                try {
                    const res = await handler(event);
                    if (res && (res).producedEvents) {
                        finalEvents = (res).producedEvents as NewEvent[];
                        overriddenByOnEvent = true;
                    }
                } catch (_err) { /* ignore user callback errors */ }
            }

            // 2) Default processor path (only if not overridden)
            if (!overriddenByOnEvent && processor) {
                const ok = await processor.shouldProcess(event, deps);
                if (ok) {
                    const res = await processor.process(event, deps);
                    if (res?.producedEvents) finalEvents = res.producedEvents
                }
            }

            const allToEnqueue = [...preEvents, ...finalEvents];

            if (allToEnqueue.length > 0) {
                for (const e of allToEnqueue) {
                    await enqueueEvent(db, e);
                }
            }

            const finalStatus = overriddenByOnEvent ? "overwritten" : "completed";
            await ops.updateQueueItemStatus(next.id, finalStatus);
        } catch (err) {
            console.error("Event worker failed:", err);
            await ops.updateQueueItemStatus(next.id, "failed");
            break;
        }
    }
}


