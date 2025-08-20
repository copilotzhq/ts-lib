import { createDatabase } from "./database/index.ts";

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
  shouldProcess: (event: QueueEvent<TPayload>, deps: TDeps) => boolean | Promise<boolean>;
  preProcess?: (event: QueueEvent<TPayload>, deps: TDeps) => Promise<void>;
  postProcess?: (event: QueueEvent<TPayload>, deps: TDeps) => Promise<void>;
  process: (event: QueueEvent<TPayload>, deps: TDeps) => Promise<{ producedEvents?: NewQueueEvent[] }>;
}

export type OnEventResponse =
  | void
  | { event: QueueEvent<unknown> }
  | { producedEvents: NewQueueEvent[] }
  | { drop: true };

export interface WorkerContext {
  callbacks?: {
    onEvent?: (ev: QueueEvent<unknown>, runDefault: (override?: QueueEvent<unknown>) => Promise<{ producedEvents?: NewQueueEvent[] }>) => Promise<OnEventResponse | void> | OnEventResponse | void;
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

async function runWithOnEvent<TDeps>(
  event: QueueEvent,
  deps: TDeps,
  processors: Record<string, EventProcessor<any, TDeps>>,
  context?: WorkerContext
): Promise<{ producedEvents?: NewQueueEvent[] }> {
  const onEvenHandler = context?.callbacks?.onEvent;

  const execute = async (e: QueueEvent = event, _handler?: (e: QueueEvent) => Promise<{ producedEvents?: NewQueueEvent[] } | void>): Promise<{ producedEvents?: NewQueueEvent[] }> => {
    const processor = processors[e.type];
    if (!processor) return { producedEvents: [] };
    const ok = await processor.shouldProcess(e as QueueEvent<unknown>, deps);
    if (!ok) return { producedEvents: [] };
    // preProcess
    processor.preProcess && await processor.preProcess(e as QueueEvent<unknown>, deps);
    const handler = _handler || processor.process;
    const result = await handler(e as QueueEvent<unknown>, deps);
    processor.postProcess && await processor.postProcess(e as QueueEvent<unknown>, deps);
    // Normalize falsy/void returns from processors to an empty producedEvents object
    return result || { producedEvents: [] };
  };

  try {
    const resp = await execute(event, onEvenHandler);
    if ((resp as { drop?: boolean }).drop) return { producedEvents: [] };
    if ((resp as { event?: QueueEvent<unknown> }).event) return execute((resp as { event: QueueEvent<unknown> }).event as QueueEvent);
    if ((resp as { producedEvents?: NewQueueEvent[] }).producedEvents) return { producedEvents: (resp as { producedEvents: NewQueueEvent[] }).producedEvents };
    return execute(event);
  } catch (_err) {
    return execute(event);
  }
}

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
      const { producedEvents } = await runWithOnEvent(event, deps, processors, context);

      if (producedEvents && producedEvents.length > 0) {
        await enqueueEvents(db, producedEvents);
      }
      await ops.updateQueueItemStatus(next.id, "completed");
    } catch (err) {
      console.error("Event worker failed:", err);
      await ops.updateQueueItemStatus(next.id, "failed");
      break;
    }
  }
}


