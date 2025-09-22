import { createDatabase } from "../database/index.ts";

// Generic queue event types
export interface QueueEvent<TPayload = unknown> {
  id?: string;
  threadId: string;
  type: string;
  payload: TPayload;
  parentEventId?: string;
  traceId?: string;
  priority?: number;
}

export type NewQueueEvent<TPayload = unknown> = Omit<QueueEvent<TPayload>, "id">;

// Back-compat re-exports for agents/knowledge imports
export type GenericQueueEvent<TPayload = unknown> = QueueEvent<TPayload>;
export type GenericNewQueueEvent<TPayload = unknown> = NewQueueEvent<TPayload>;

// Processor contract (mirrors agents engine)
export interface EventProcessor<TPayload = unknown, TDeps = unknown> {
  // Optional preprocessing step (e.g., persist incoming messages)
  preProcess?: (event: QueueEvent<TPayload>, deps: TDeps) => Promise<{ producedEvents?: NewQueueEvent[] } | void> | { producedEvents?: NewQueueEvent[] } | void;
  shouldProcess: (event: QueueEvent<TPayload>, deps: TDeps) => boolean | Promise<boolean>;
  process: (event: QueueEvent<TPayload>, deps: TDeps) => Promise<{ producedEvents?: NewQueueEvent[] } | void> | { producedEvents?: NewQueueEvent[] } | void;
}

export type OnEventResponse =
  | void
  | { event: QueueEvent<unknown> }
  | { producedEvents: NewQueueEvent[] }
  | { drop: true };

export interface WorkerContext {
  callbacks?: {
    // Optional: allow listeners to append produced events
    onEvent?: (ev: QueueEvent<unknown>) => Promise<{ producedEvents?: NewQueueEvent[] } | void> | { producedEvents?: NewQueueEvent[] } | void;
  };
}

// Enqueue helpers
export async function enqueueEvent(db: unknown, event: NewQueueEvent): Promise<void> {
  const ops = (db as any).operations;
  await ops.addToQueue(event.threadId, {
    eventType: event.type,
    payload: event.payload as object,
    parentEventId: event.parentEventId,
    traceId: event.traceId,
    priority: event.priority,
    metadata: undefined,
  });
}

export async function enqueueEvents(db: unknown, events: NewQueueEvent[]): Promise<void> {
  for (const e of events) {
    await enqueueEvent(db, e);
  }
}

// no longer used with preProcess + simplified onEvent

// Generic worker
export async function startEventWorker<TDeps>(
  db: unknown,
  threadId: string,
  context: WorkerContext,
  processors: Record<string, EventProcessor<any, TDeps>>,
  buildDeps: (ops: any, event: QueueEvent<unknown>, context: WorkerContext) => Promise<TDeps> | TDeps,
  shouldAcceptEvent?: (event: QueueEvent<unknown>) => boolean
): Promise<void> {

  const dbInstance = db || await createDatabase({});

  const ops = (dbInstance as any).operations;

  const processing = await ops.getProcessingQueueItem(threadId);

  if (processing) return;

  while (true) {
    const next = await ops.getNextPendingQueueItem(threadId);

    if (!next) break;

    const event: QueueEvent = {
      id: next.id,
      threadId: next.threadId,
      type: next.eventType as string,
      payload: next.payload as unknown,
      parentEventId: (next as any).parentEventId || undefined,
      traceId: (next as any).traceId || undefined,
      priority: (next as any).priority || undefined,
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
      const preEvents: NewQueueEvent[] = [];
      let finalEvents: NewQueueEvent[] = [];

      // 1) Pre-process (always runs when available)
      if (processor?.preProcess) {
        const pre = await processor.preProcess(event as any, deps as any);
        if (pre && (pre as any).producedEvents) preEvents.push(...(pre as any).producedEvents);
      }

      // 2) onEvent callback with override semantics
      const handler = context?.callbacks?.onEvent;
      let overriddenByOnEvent = false;
      if (handler) {
        try {
          const res = await handler(event);
          if (res && (res as any).producedEvents) {
            finalEvents = (res as any).producedEvents as NewQueueEvent[];
            overriddenByOnEvent = true;
          }
        } catch (_err) { /* ignore user callback errors */ }
      }

      // 3) Default processor path (only if not overridden)
      if (!overriddenByOnEvent && processor) {
        const ok = await processor.shouldProcess(event as any, deps as any);
        if (ok) {
          const res = await processor.process(event as any, deps as any);
          if (res && (res as any).producedEvents) finalEvents = (res as any).producedEvents as NewQueueEvent[];
        }
      }

      const allToEnqueue = [...preEvents, ...finalEvents];
      if (allToEnqueue.length > 0) {
        await enqueueEvents(db, allToEnqueue);
      }
      await ops.updateQueueItemStatus(next.id, "completed");
    } catch (err) {
      console.error("Event worker failed:", err);
      await ops.updateQueueItemStatus(next.id, "failed");
      break;
    }
  }
}


