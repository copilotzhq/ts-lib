import { createDatabase as createRootDatabase } from "../../database/index.ts";

export interface EventQueueDatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
  useWorker?: boolean;
}

// Deprecated local cache (kept for back-compat; not used)
const _connectionCache: Map<string, Promise<unknown>> = new Map();

export async function createDatabase(config?: EventQueueDatabaseConfig): Promise<unknown> {
  return await createRootDatabase(config as any);
}

export * from "./schema.ts";


