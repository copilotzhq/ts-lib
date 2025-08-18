import { runAI } from "../../ai/index.ts";      
import { createOperations as createKnowledgeOperations } from "../database/operations.ts";
import { extractDocument, getRecommendedConfig } from "../extractors/index.ts";
import { chunkText, estimateOptimalChunkSize } from "../chunking/index.ts";
import { startEventWorker, enqueueEvent as enqueueGenericEvent, enqueueEvents as enqueueGenericEvents, type QueueEvent as GenericQueueEvent, type NewQueueEvent as GenericNewQueueEvent } from "../../event-queue/index.ts";

// Event types for knowledge pipeline
export type KBEventType =
  | "KB_INGEST"
  | "KB_EMBED_REQUEST"
  | "KB_EMBED_RESULT"
  | "KB_QUERY"
  | "KB_SEARCH"
  | "KB_RETRIEVE"
  | "KB_COLLECTIONS"
  | "KB_DONE"
  | "SYSTEM";

export type KBQueueEvent<T = unknown> = GenericQueueEvent<T> & { type: KBEventType };
export type NewKBQueueEvent<T = unknown> = GenericNewQueueEvent<T> & { type: KBEventType };

// Payloads
export interface KBIngestPayload {
  source: any;
  collectionId?: string;
  extractConfig?: any;
  chunking?: {
    strategy?: string;
    size?: number;
    overlap?: number;
    preserveStructure?: boolean;
    minChunkSize?: number;
    maxChunkSize?: number;
  };
  embedding?: {
    provider?: string;
    model?: string;
    dimensions?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface KBEmbedRequestPayload {
  documentId: string;
  chunkIds: string[];
  provider: string;
  model: string;
}

export interface KBEmbedResultPayload {
  documentId: string;
  chunkIds: string[];
  success: boolean;
}

export interface KBQueryPayload {
  query: string;
  config?: {
    limit?: number;
    threshold?: number;
    filter?: any;
  };
  embedding?: {
    provider?: string;
    model?: string;
  };
}

export interface KBSearchPayload {
  query: string;
  config?: {
    searchType?: "semantic" | "keyword" | "hybrid";
    limit?: number;
    threshold?: number;
    filter?: any;
  };
  embedding?: {
    provider?: string;
    model?: string;
  };
}

export interface KBRetrievePayload {
  documentId: string;
}

export interface KBCollectionsPayload {
  action: "list" | "create" | "delete";
  data?: { name: string; description?: string; metadata?: any };
}

export interface KBContext {
  dbInstance: unknown;
  callbacks?: {
    onEvent?: (event: KBQueueEvent<unknown>) => Promise<void> | void;
  };
}

// Enqueue helpers
export async function enqueueKnowledgeEvent(
  dbInstance: unknown,
  event: NewKBQueueEvent
): Promise<void> {
//   const ops = (dbInstance as any).operations;
//   await ops.findOrCreateThread(event.threadId, { name: 'Knowledge Thread' });
  await enqueueGenericEvent(dbInstance, event as GenericNewQueueEvent);
}

export async function enqueueKnowledgeEvents(
  dbInstance: unknown,
  events: NewKBQueueEvent[]
): Promise<void> {
  for (const e of events) {
    await enqueueGenericEvent(dbInstance, e as GenericNewQueueEvent);
  }
}

// Processor layer
type ProcessorDeps = {
  ops: ReturnType<typeof createKnowledgeOperations>;
  context: KBContext;
}

type KBProcessResult = { producedEvents?: NewKBQueueEvent[]; documentId?: string } | void;
interface KBEventProcessor<TPayload = unknown> {
  shouldProcess: (event: KBQueueEvent<TPayload>, deps: ProcessorDeps) => boolean | Promise<boolean>;
  process: (event: KBQueueEvent<TPayload>, deps: ProcessorDeps) => Promise<KBProcessResult>;
}

const kbIngestProcessor: KBEventProcessor<KBIngestPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const payload = event.payload as KBIngestPayload;

    const extractionRequest = {
      source: payload.source,
      config: payload.extractConfig || getRecommendedConfig(payload.source) || { provider: 'text', options: payload.chunking },
      metadata: { collectionId: payload.collectionId }
    };
    const extractionResult = await extractDocument(extractionRequest);
    if (!(extractionResult as any).success) {
      return;
    }

    const docData = {
      title: extractionResult.metadata?.title || 'Untitled Document',
      content: extractionResult.content!,
      documentType: inferDocumentType(payload.source),
      sourceType: payload.source.type,
      sourceUrl: payload.source.type === 'url' ? payload.source.url : undefined,
      fileName: extractFileName(payload.source),
      fileSize: extractFileSize(payload.source),
      mimeType: extractMimeType(payload.source),
      metadata: extractionResult.metadata || {},
      extractedAt: new Date().toISOString(),
      status: 'completed' as const,
    };
    const documentId = await deps.ops.insertDocument(docData as any);

    let chunks = (extractionResult as any).chunks;
    if (!chunks) {
      const optimal = estimateOptimalChunkSize(extractionResult.content!);
      const cfg = {
        strategy: (payload.chunking?.strategy || optimal.strategy) as any,
        size: payload.chunking?.size ?? optimal.recommended,
        overlap: payload.chunking?.overlap ?? 200,
        preserveStructure: payload.chunking?.preserveStructure ?? true,
        minChunkSize: payload.chunking?.minChunkSize ?? 50,
        maxChunkSize: payload.chunking?.maxChunkSize ?? (payload.chunking?.size ? payload.chunking.size * 2 : 2000),
      };
      chunks = chunkText(extractionResult.content!, cfg as any);
    }
    let chunkIds: string[] = [];
    if (chunks.length > 0) {
      const entities = chunks.map((c: any, i: number) => ({
        documentId,
        content: c.content,
        startIndex: c.startIndex,
        endIndex: c.endIndex,
        chunkIndex: i,
        metadata: c.metadata || {}
      }));
      chunkIds = await deps.ops.insertChunks(entities as any);
    }

    if (payload.collectionId) {
      await deps.ops.addDocumentToCollection(documentId, payload.collectionId);
    }

    if (chunkIds.length > 0) {
      return {
        producedEvents: [{
          threadId: event.threadId,
          type: "KB_EMBED_REQUEST",
          payload: {
            documentId,
            chunkIds,
            provider: payload.embedding?.provider || 'openai',
            model: payload.embedding?.model || 'text-embedding-3-small',
          } as KBEmbedRequestPayload,
          parentEventId: event.id,
          traceId: event.traceId,
        }],
        documentId,
      };
    }

    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_DONE",
        payload: { documentId },
        parentEventId: event.id,
        traceId: event.traceId,
      }],
      documentId,
    };
  }
};

const kbEmbedRequestProcessor: KBEventProcessor<KBEmbedRequestPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const payload = event.payload as KBEmbedRequestPayload;
    for (const chunkId of payload.chunkIds) {
      const chunks = await deps.ops.getChunks(payload.documentId);
      const target = chunks.find((c: any) => c.id === chunkId);
      if (!target) continue;
      try {
        const { result } = await runAI(
          { db: (deps.context as any).dbInstance, threadId: event.threadId, traceId: crypto.randomUUID() },
          { type: 'embedding', input: target.content, config: { provider: payload.provider as any, model: payload.model } } as any
        );
        const vector = Array.isArray((result as any)?.embeddings?.[0]) ? (result as any).embeddings[0] : (result as any)?.embeddings;
        if (Array.isArray(vector)) {
          await deps.ops.updateChunkEmbedding(chunkId, vector, payload.model);
        }
      } catch (_err) { /* recorded elsewhere */ }
    }

    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_EMBED_RESULT",
        payload: { documentId: payload.documentId, chunkIds: payload.chunkIds, success: true } as KBEmbedResultPayload,
        parentEventId: event.id,
        traceId: event.traceId,
      }],
      documentId: payload.documentId,
    };
  }
};

const kbEmbedResultProcessor: KBEventProcessor<KBEmbedResultPayload> = {
  shouldProcess: () => true,
  process: async (event, _deps) => {
    const res = event.payload as KBEmbedResultPayload;
    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_DONE",
        payload: res,
        parentEventId: event.id,
        traceId: event.traceId,
      }],
      documentId: res.documentId,
    };
  }
};

const kbQueryProcessor: KBEventProcessor<KBQueryPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const startedAt = Date.now();
    const payload = event.payload as KBQueryPayload;
    const provider = payload.embedding?.provider || 'openai';
    const model = payload.embedding?.model || 'text-embedding-3-small';

    try {
      const { result } = await runAI(
        { db: (deps.context as any).dbInstance, threadId: event.threadId, traceId: crypto.randomUUID() },
        { type: 'embedding', input: payload.query, config: { provider: provider as any, model } } as any
      );
      const vector = Array.isArray((result as any)?.embeddings?.[0]) ? (result as any).embeddings[0] : (result as any)?.embeddings;
      const results = await deps.ops.searchSemantic(vector as number[], {
        limit: payload.config?.limit || 10,
        threshold: payload.config?.threshold ?? 0.7,
        filters: payload.config?.filter,
      });
      const processingTime = Date.now() - startedAt;
      return {
        producedEvents: [{
          threadId: event.threadId,
          type: "KB_DONE",
          payload: { type: 'query', results, totalResults: results.length, processingTime },
          parentEventId: event.id,
          traceId: event.traceId,
        }],
      };
    } catch (_err) {
      const results = await deps.ops.searchKeyword(payload.query, {
        limit: payload.config?.limit || 10,
        threshold: payload.config?.threshold ?? 0.1,
        filters: payload.config?.filter,
      });
      const processingTime = Date.now() - startedAt;
      return {
        producedEvents: [{
          threadId: event.threadId,
          type: "KB_DONE",
          payload: { type: 'query', results, totalResults: results.length, processingTime },
          parentEventId: event.id,
          traceId: event.traceId,
        }],
      };
    }
  }
};

const kbSearchProcessor: KBEventProcessor<KBSearchPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const startedAt = Date.now();
    const payload = event.payload as KBSearchPayload;
    const provider = payload.embedding?.provider || 'openai';
    const model = payload.embedding?.model || 'text-embedding-3-small';
    const type = payload.config?.searchType || 'hybrid';

    let results: any[] = [];
    try {
      if (type === 'keyword') {
        results = await deps.ops.searchKeyword(payload.query, {
          limit: payload.config?.limit || 10,
          threshold: payload.config?.threshold ?? 0.1,
          filters: payload.config?.filter,
        });
      } else if (type === 'semantic') {
        const { result } = await runAI(
          { db: (deps.context as any).dbInstance, threadId: event.threadId, traceId: crypto.randomUUID() },
          { type: 'embedding', input: payload.query, config: { provider: provider as any, model } } as any
        );
        const vector = Array.isArray((result as any)?.embeddings?.[0]) ? (result as any).embeddings[0] : (result as any)?.embeddings;
        results = await deps.ops.searchSemantic(vector as number[], {
          limit: payload.config?.limit || 10,
          threshold: payload.config?.threshold ?? 0.7,
          filters: payload.config?.filter,
        });
      } else {
        const { result } = await runAI(
          { db: (deps.context as any).dbInstance, threadId: event.threadId, traceId: crypto.randomUUID() },
          { type: 'embedding', input: payload.query, config: { provider: provider as any, model } } as any
        );
        const vector = Array.isArray((result as any)?.embeddings?.[0]) ? (result as any).embeddings[0] : (result as any)?.embeddings;
        results = await deps.ops.searchHybrid(payload.query, vector as number[], {
          limit: payload.config?.limit || 10,
          threshold: payload.config?.threshold ?? 0.5,
          filters: payload.config?.filter,
        });
      }
    } catch (_err) {
      // Fallback to keyword
      results = await deps.ops.searchKeyword(payload.query, {
        limit: payload.config?.limit || 10,
        threshold: payload.config?.threshold ?? 0.1,
        filters: payload.config?.filter,
      });
    }

    const processingTime = Date.now() - startedAt;
    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_DONE",
        payload: { type: 'search', results, totalResults: results.length, processingTime },
        parentEventId: event.id,
        traceId: event.traceId,
      }],
    };
  }
};

const kbRetrieveProcessor: KBEventProcessor<KBRetrievePayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const payload = event.payload as KBRetrievePayload;
    const document = await deps.ops.getDocument(payload.documentId);
    const chunks = document ? await deps.ops.getChunks(payload.documentId) : [];
    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_DONE",
        payload: document ? { type: 'retrieve', document, chunks } : { type: 'retrieve', error: 'Document not found' },
        parentEventId: event.id,
        traceId: event.traceId,
      }],
    };
  }
};

const kbCollectionsProcessor: KBEventProcessor<KBCollectionsPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const payload = event.payload as KBCollectionsPayload;
    if (payload.action === 'list') {
      const collections = await deps.ops.listCollections();
      return {
        producedEvents: [{
          threadId: event.threadId,
          type: "KB_DONE",
          payload: { type: 'collections', success: true, collections },
          parentEventId: event.id,
          traceId: event.traceId,
        }],
      };
    }
    if (payload.action === 'create' && payload.data) {
      const id = await deps.ops.createCollection(payload.data as any);
      return {
        producedEvents: [{
          threadId: event.threadId,
          type: "KB_DONE",
          payload: { type: 'collections', success: true, collections: [{ id, ...payload.data }] },
          parentEventId: event.id,
          traceId: event.traceId,
        }],
      };
    }
    return {
      producedEvents: [{
        threadId: event.threadId,
        type: "KB_DONE",
        payload: { type: 'collections', success: false, error: 'Unknown action' },
        parentEventId: event.id,
        traceId: event.traceId,
      }],
    };
  }
};

const kbDoneProcessor: KBEventProcessor = { shouldProcess: () => true, process: async () => { return; } };
const systemProcessor: KBEventProcessor = { shouldProcess: () => true, process: async () => { return; } };

const kbProcessors: Record<KBEventType, KBEventProcessor<any>> = {
  KB_INGEST: kbIngestProcessor,
  KB_EMBED_REQUEST: kbEmbedRequestProcessor,
  KB_EMBED_RESULT: kbEmbedResultProcessor,
  KB_QUERY: kbQueryProcessor,
  KB_SEARCH: kbSearchProcessor,
  KB_RETRIEVE: kbRetrieveProcessor,
  KB_COLLECTIONS: kbCollectionsProcessor,
  KB_DONE: kbDoneProcessor,
  SYSTEM: systemProcessor,
};

// Worker
export async function startKnowledgeWorker(
  context: KBContext,
  threadId: string
): Promise<{ threadId: string; documentId?: string }> {
  let resultDocumentId: string | undefined;
  await startEventWorker(
    (context as any).dbInstance,
    threadId,
    { callbacks: context.callbacks as any },
    kbProcessors as any,
    async (_ops, _event) => {
      const kbOps = ((context as any).dbInstance as any)?.kbOps || createKnowledgeOperations((context as any).dbInstance);
      if (kbOps?.initialize) { try { await kbOps.initialize(); } catch { /* ignore */ } }
      return { ops: kbOps, context };
    },
    (event) => String(event.type || "").startsWith("KB_")
  );
  return { threadId, documentId: resultDocumentId };
}

// Convenience API
export async function runKnowledgeIngest(
  context: KBContext & { threadId?: string },
  ingest: KBIngestPayload
): Promise<{ threadId: string; documentId?: string }> {
  const threadId = (context as any).threadId || crypto.randomUUID();
  await enqueueKnowledgeEvent((context as any).dbInstance, {
    threadId,
    type: "KB_INGEST",
    payload: ingest as any,
  } as any);
  const res = await startKnowledgeWorker(context, threadId);
  return res;
}

// Local helpers (duplicated to avoid importing privates)
function inferDocumentType(source: any): any {
  if (source.type === 'url') {
    const url = source.url?.toLowerCase?.() || '';
    if (url.endsWith('.pdf')) return 'pdf';
    if (url.endsWith('.doc') || url.endsWith('.docx')) return 'doc';
    if (url.endsWith('.csv')) return 'csv';
    if (url.endsWith('.json')) return 'json';
    return 'web';
  }
  if (source.type === 'file') {
    const mimeType = source.file?.type || '';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word')) return 'doc';
    if (mimeType === 'text/csv') return 'csv';
    if (mimeType === 'application/json') return 'json';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }
  return 'txt';
}
function extractFileName(source: any): string | undefined {
  if (source.fileName) return source.fileName;
  if (source.type === 'url' && source.url) {
    try {
      const url = new URL(source.url);
      return url.pathname.split('/').pop() || undefined;
    } catch { return undefined; }
  }
  return undefined;
}
function extractFileSize(source: any): number | undefined {
  if (source.type === 'file' && source.file?.size) return source.file.size;
  return undefined;
}
function extractMimeType(source: any): string | undefined {
  if (source.type === 'file') return source.file?.type;
  if (source.type === 'base64') return source.mimeType;
  return undefined;
}


