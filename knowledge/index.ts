import { createDatabase as createEventDb } from "../agents/database/index.ts";
import { runKnowledgeIngest, startKnowledgeWorker, enqueueKnowledgeEvent, type KBIngestPayload, type KBContext, type KBQueryPayload, type KBSearchPayload, type KBRetrievePayload, type KBCollectionsPayload, type KBQueueEvent } from "./threads/event-queue.ts";

export type KnowledgeConfig = {
  dbInstance?: any;
  dbConfig?: { url?: string; syncUrl?: string };
  callbacks?: KBContext['callbacks'];
};

export async function knowledge(config?: KnowledgeConfig) {
  const dbInstance = config?.dbInstance || await createEventDb(config?.dbConfig);

  const ctx: KBContext = { dbInstance, callbacks: config?.callbacks } as any;

  type KnowledgeHandlers = {
    onEvent?: (event: KBQueueEvent<unknown>) => void | Promise<void>;
    onDone?: (payload: any, event: KBQueueEvent<unknown>) => void | Promise<void>;
    awaitDone?: boolean;
  };

  return {
    context: ctx,
    ingest: (payload: KBIngestPayload & { threadId?: string }) => runKnowledgeIngest({ ...ctx, threadId: payload.threadId } as any, payload),
    query: async (payload: KBQueryPayload & { threadId?: string }, handlers?: KnowledgeHandlers) => {
      const threadId = (payload as any).threadId || crypto.randomUUID();
      await enqueueKnowledgeEvent(dbInstance, { threadId, type: 'KB_QUERY' as any, payload } as any);
      let resultPayload: any | undefined;
      const combinedCtx: KBContext = {
        ...(ctx as any),
        callbacks: {
          onEvent: async (ev: KBQueueEvent<unknown>) => {
            try { await (config?.callbacks as any)?.onEvent?.(ev as any); } catch { }
            try { await handlers?.onEvent?.(ev as any); } catch { }
            if ((ev as any).type === 'KB_DONE') {
              resultPayload = (ev as any).payload;
              try { await handlers?.onDone?.((ev as any).payload, ev as any); } catch { }
            }
          }
        }
      } as any;
      await startKnowledgeWorker(combinedCtx, threadId);
      return handlers?.awaitDone ? { threadId, result: resultPayload } : { threadId };
    },
    search: async (payload: KBSearchPayload & { threadId?: string }, handlers?: KnowledgeHandlers) => {
      const threadId = (payload as any).threadId || crypto.randomUUID();
      await enqueueKnowledgeEvent(dbInstance, { threadId, type: 'KB_SEARCH' as any, payload } as any);
      let resultPayload: any | undefined;
      const combinedCtx: KBContext = {
        ...(ctx as any),
        callbacks: {
          onEvent: async (ev: KBQueueEvent<unknown>) => {
            try { await (config?.callbacks as any)?.onEvent?.(ev as any); } catch { }
            try { await handlers?.onEvent?.(ev as any); } catch { }
            if ((ev as any).type === 'KB_DONE') {
              resultPayload = (ev as any).payload;
              try { await handlers?.onDone?.((ev as any).payload, ev as any); } catch { }
            }
          }
        }
      } as any;
      await startKnowledgeWorker(combinedCtx, threadId);
      return handlers?.awaitDone ? { threadId, result: resultPayload } : { threadId };
    },
    retrieve: async (payload: KBRetrievePayload & { threadId?: string }, handlers?: KnowledgeHandlers) => {
      const threadId = (payload as any).threadId || crypto.randomUUID();
      await enqueueKnowledgeEvent(dbInstance, { threadId, type: 'KB_RETRIEVE' as any, payload } as any);
      let resultPayload: any | undefined;
      const combinedCtx: KBContext = {
        ...(ctx as any),
        callbacks: {
          onEvent: async (ev: KBQueueEvent<unknown>) => {
            try { await (config?.callbacks as any)?.onEvent?.(ev as any); } catch { }
            try { await handlers?.onEvent?.(ev as any); } catch { }
            if ((ev as any).type === 'KB_DONE') {
              resultPayload = (ev as any).payload;
              try { await handlers?.onDone?.((ev as any).payload, ev as any); } catch { }
            }
          }
        }
      } as any;
      await startKnowledgeWorker(combinedCtx, threadId);
      return handlers?.awaitDone ? { threadId, result: resultPayload } : { threadId };
    },
    collections: async (payload: KBCollectionsPayload & { threadId?: string }, handlers?: KnowledgeHandlers) => {
      const threadId = (payload as any).threadId || crypto.randomUUID();
      await enqueueKnowledgeEvent(dbInstance, { threadId, type: 'KB_COLLECTIONS' as any, payload } as any);
      let resultPayload: any | undefined;
      const combinedCtx: KBContext = {
        ...(ctx as any),
        callbacks: {
          onEvent: async (ev: KBQueueEvent<unknown>) => {
            try { await (config?.callbacks as any)?.onEvent?.(ev as any); } catch { }
            try { await handlers?.onEvent?.(ev as any); } catch { }
            if ((ev as any).type === 'KB_DONE') {
              resultPayload = (ev as any).payload;
              try { await handlers?.onDone?.((ev as any).payload, ev as any); } catch { }
            }
          }
        }
      } as any;
      await startKnowledgeWorker(combinedCtx, threadId);
      return handlers?.awaitDone ? { threadId, result: resultPayload } : { threadId };
    },
    enqueue: (threadId: string, type: string, payload: any) => enqueueKnowledgeEvent(dbInstance, { threadId, type: type as any, payload } as any),
    process: (threadId: string) => startKnowledgeWorker(ctx, threadId),
  };
}

export type KnowledgeFacade = Awaited<ReturnType<typeof knowledge>>;


