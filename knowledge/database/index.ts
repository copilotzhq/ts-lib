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

  const ominipg = await Ominipg.connect(finalConfig);
  const dbInstance = await withDrizzle(ominipg, drizzle, knowledgeBaseSchema);
  // Attach knowledge operations for convenience (similar to agents db)
  (dbInstance as any).kbOps = createKnowledgeOperations(dbInstance);
  return dbInstance;
}

export type KnowledgeDbInstance = Awaited<ReturnType<typeof createKnowledgeDatabase>>;

export * from './schema.ts';

