import { Ominipg, withDrizzle } from 'omnipg';
import { drizzle } from '../../db/drizzle.ts';
import { knowledgeBaseSchema, knowledgeBaseDDL } from './schema.ts';
import { createOperations as createKnowledgeOperations } from './operations.ts';

export interface KnowledgeDatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string[];
}

// Memoize knowledge DB connections by URL+syncUrl
const connectionCache: Map<string, Promise<any>> = new Map();

export async function createKnowledgeDatabase(config?: KnowledgeDatabaseConfig): Promise<any> {
  const finalSchemaSQL = Array.isArray(config?.schemaSQL) && (config!.schemaSQL!.length > 0)
    ? (config as KnowledgeDatabaseConfig).schemaSQL!
    : knowledgeBaseDDL;

  const finalConfig = {
    url: config?.url || Deno.env.get('KNOWLEDGE_DATABASE_URL') || Deno.env.get('DATABASE_URL') || ':memory:',
    syncUrl: config?.syncUrl || Deno.env.get('KNOWLEDGE_SYNC_DATABASE_URL') || Deno.env.get('SYNC_DATABASE_URL'),
    pgliteExtensions: config?.pgliteExtensions || ['uuid_ossp', 'vector', 'pg_trgm'],
    schemaSQL: finalSchemaSQL,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  if (connectionCache.has(cacheKey)) {
    return await connectionCache.get(cacheKey)!;
  }

  const connectPromise = (async () => {
    const ominipg = await Ominipg.connect(finalConfig);
    const dbInstance = await withDrizzle(ominipg, drizzle, knowledgeBaseSchema);
    (dbInstance as any).kbOps = createKnowledgeOperations(dbInstance);
    return dbInstance;
  })();

  connectionCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export type KnowledgeDbInstance = Awaited<ReturnType<typeof createKnowledgeDatabase>>;

export * from './schema.ts';

