// Import Database
import { createDatabase, type CopilotzDb } from "@/database/index.ts";

// Import Agent Interfaces  
import type {
    Thread,
    Event,
    NewEvent,
    MessagePayload,
    ToolCallEventPayload,
    LlmCallEventPayload,
    TokenEventPayload,
} from "@/interfaces/index.ts";

// Import Processors
import { llmCallProcessor } from "./llm_call/index.ts";
import { messageProcessor } from "./new_message/index.ts";
import { toolCallProcessor } from "./tool_call/index.ts";

// Internal Event Types
type EventType = Event["type"];

// Typed Event Payloads
import type { LLMCallPayload, LLMResultPayload } from "./llm_call/index.ts";
import type { ToolCallPayload, ToolResultPayload, ToolExecutionContext } from "./tool_call/index.ts";
import type { ChatContext } from "@/interfaces/index.ts";

import type { ExecutableTool, ToolExecutor } from "./tool_call/types.ts";
export type { LLMCallPayload, LLMResultPayload, ToolCallPayload, ToolResultPayload, ToolExecutionContext, ExecutableTool, ToolExecutor };

export interface ProcessResult {
    producedEvents: NewEvent[];
}

export type ProcessorDeps = {
    db: CopilotzDb;
    thread: Thread;
    context: ChatContext;
}

type Operations = CopilotzDb["ops"];

type EventProcessors = Record<EventType, EventProcessor<unknown, ProcessorDeps>>;

function castEventPayload(type: "NEW_MESSAGE", payload: unknown): MessagePayload;
function castEventPayload(type: "TOOL_CALL", payload: unknown): ToolCallEventPayload;
function castEventPayload(type: "LLM_CALL", payload: unknown): LlmCallEventPayload;
function castEventPayload(type: "TOKEN", payload: unknown): TokenEventPayload;
function castEventPayload(type: Event["type"], payload: unknown): Event["payload"] {
    switch (type) {
        case "NEW_MESSAGE":
            return payload as MessagePayload;
        case "TOOL_CALL":
            return payload as ToolCallEventPayload;
        case "LLM_CALL":
            return payload as LlmCallEventPayload;
        case "TOKEN":
        default:
            return payload as TokenEventPayload;
    }
}

// Processor registry
const tokenProcessor: EventProcessor<unknown, ProcessorDeps> = {
    shouldProcess: () => false,
    process: () => ({ producedEvents: [] }),
};

const processors: EventProcessors = {
    LLM_CALL: llmCallProcessor,
    NEW_MESSAGE: messageProcessor,
    TOOL_CALL: toolCallProcessor,
    TOKEN: tokenProcessor,
    
};

// Public API
export async function enqueueEvent(db: CopilotzDb, event: NewEvent): Promise<void> {
    const ops = db.ops;
    const { threadId } = event;

    if (typeof threadId !== "string") {
        throw new Error("Invalid thread id for event");
    }

    if (event.type === "TOKEN") {
        throw new Error("TOKEN events are ephemeral and must not be enqueued");
    }

    const parentEventId = typeof event.parentEventId === "string"
        ? event.parentEventId
        : undefined;
    const traceId = typeof event.traceId === "string" ? event.traceId : undefined;

    await ops.addToQueue(threadId, {
        eventType: event.type,
        payload: event.payload,
        parentEventId,
        traceId,
        priority: event.priority ?? undefined,
        metadata:event.metadata,
        ttlMs: event.ttlMs ?? undefined,
        status: event.status,
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
            const { threadId } = event;
            if (typeof threadId !== "string") {
                throw new Error("Invalid thread id for event");
            }

            const thread = await ops.getThreadById(threadId);
            if (!thread) throw new Error(`Thread not found: ${threadId}`);
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

    const ops = dbInstance.ops as Operations;

    const processing = await ops.getProcessingQueueItem(threadId);

    if (processing) return;

    while (true) {

        const next = await ops.getNextPendingQueueItem(threadId);

        if (!next) break;

        const eventType = next.eventType as Event["type"];
        const baseEvent = {
            id: next.id,
            threadId: next.threadId,
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

        let event: Event;
        switch (eventType) {
            case "NEW_MESSAGE":
                event = {
                    ...baseEvent,
                    type: "NEW_MESSAGE",
                    payload: castEventPayload("NEW_MESSAGE", next.payload),
                };
                break;
            case "TOOL_CALL":
                event = {
                    ...baseEvent,
                    type: "TOOL_CALL",
                    payload: castEventPayload("TOOL_CALL", next.payload),
                };
                break;
            case "LLM_CALL":
                event = {
                    ...baseEvent,
                    type: "LLM_CALL",
                    payload: castEventPayload("LLM_CALL", next.payload),
                };
                break;
            case "TOKEN":
            default:
                event = {
                    ...baseEvent,
                    type: "TOKEN",
                    payload: castEventPayload("TOKEN", next.payload),
                };
                break;
        }

        if (typeof shouldAcceptEvent === 'function' && !shouldAcceptEvent(event)) {
            // Let another domain worker process this event
            break;
        }

        const queueId = typeof next.id === "string" ? next.id : String(next.id);

        await ops.updateQueueItemStatus(queueId, "processing");

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
            await ops.updateQueueItemStatus(queueId, finalStatus);
        } catch (err) {
            console.error("Event worker failed:", err);
            await ops.updateQueueItemStatus(queueId, "failed");
            break;
        }
    }

}


