// Import Database
import { createDatabase } from "@/database/index.ts";

// Import Database Operations
import { createOperations as createAgentOperations, type Operations } from "@/database/operations/index.ts";

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
import type { ToolCallPayload, ToolResultPayload } from "./tool_call/index.ts";
import type { MessagePayload } from "./new_message/index.ts";
import type { ChatContext } from "@/interfaces/index.ts";

export type { LLMCallPayload, LLMResultPayload, ToolCallPayload, ToolResultPayload, MessagePayload };

export interface ProcessResult {
    producedEvents: NewEvent[];
}

export type ProcessorDeps = {
    ops: Operations;
    db: unknown;
    thread: Thread;
    context: ChatContext;
}

type EventProcessors = {
    [key in EventType]: EventProcessor<
        LLMCallPayload | LLMResultPayload | MessagePayload | ToolCallPayload | ToolResultPayload,
        ProcessorDeps
    >;
}

// Processor registry
const processors: EventProcessors = {
    LLM_CALL: llmCallProcessor,
    NEW_MESSAGE: messageProcessor,
    TOOL_CALL: toolCallProcessor,
};

// Public API
export async function enqueueEvent(db: unknown, event: NewEvent): Promise<void> {
    const ops = (db as unknown as { operations: Operations }).operations;
    await ops.addToQueue(event.threadId, {
        eventType: event.type,
        payload: event.payload as object,
        parentEventId: event.parentEventId,
        traceId: event.traceId,
        priority: event.priority,
        metadata: undefined,
    });
}

export async function startThreadEventWorker(
    db: unknown,
    threadId: string,
    context: ChatContext
): Promise<void> {
    await startEventWorker<ProcessorDeps>(
        db,
        threadId,
        { callbacks: { onEvent: (context.callbacks as any)?.onEvent as any } },
        processors as any,
        async (_queueOps: any, event: Event) => {
            const agentOps = createAgentOperations(db);
            const thread = await agentOps.getThreadById(event.threadId);
            if (!thread) throw new Error(`Thread not found: ${event.threadId}`);
            return { ops: agentOps, db, thread, context } as ProcessorDeps;
        }
    );
}

export interface EventProcessor<TPayload = unknown, TDeps = unknown> {
    preProcess?: (event: Event, deps: TDeps) => Promise<{ producedEvents?: NewEvent[] } | void> | { producedEvents?: NewEvent[] } | void;
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
    db: unknown,
    threadId: string,
    context: WorkerContext,
    processors: Record<string, EventProcessor<any, TDeps>>,
    buildDeps: (ops: any, event: Event, context: WorkerContext) => Promise<TDeps> | TDeps,
    shouldAcceptEvent?: (event: Event) => boolean
): Promise<void> {

    const dbInstance = db || await createDatabase({});

    const ops = (dbInstance as unknown as { operations: Operations }).operations;

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

            // 1) Pre-process (always runs when available)
            if (processor?.preProcess) {
                const pre = await processor.preProcess(event, deps);
                if (pre?.producedEvents) preEvents.push(...pre.producedEvents);
            }

            // 2) onEvent callback with override semantics
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

            // 3) Default processor path (only if not overridden)
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

            await ops.updateQueueItemStatus(next.id, "completed");
        } catch (err) {
            console.error("Event worker failed:", err);
            await ops.updateQueueItemStatus(next.id, "failed");
            break;
        }
    }
}


