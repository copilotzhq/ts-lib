import { createDatabase as createRootDatabase } from '../../database/index.ts';

export interface KnowledgeDatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string[];
  useWorker?: boolean;
}

// Deprecated local cache (kept for back-compat; not used)
const _connectionCache: Map<string, Promise<unknown>> = new Map();

export async function createKnowledgeDatabase(config?: KnowledgeDatabaseConfig): Promise<unknown> {
  return await createRootDatabase(config as any);
}

export type KnowledgeDbInstance = Awaited<ReturnType<typeof createKnowledgeDatabase>>;

export * from './schema.ts';

