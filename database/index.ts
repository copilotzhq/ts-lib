import { Ominipg, withDrizzle } from "omnipg";
import { drizzle } from "../db/drizzle.ts";
import { schema, schemaDDL } from "../agents/database/schema.ts";
import { createOperations as createAgentOperations } from "../agents/database/operations.ts";
import { createOperations as createKnowledgeOperations } from "../knowledge/database/operations.ts";

export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
  useWorker?: boolean;
}

// Global connection memoization shared across modules to avoid duplicate initializations
const GLOBAL_CACHE_KEY = "__copilotz_db_cache__";
const globalCache: Map<string, Promise<unknown>> = (globalThis as any)[GLOBAL_CACHE_KEY] ?? new Map();
(globalThis as any)[GLOBAL_CACHE_KEY] = globalCache as unknown;

export async function createDatabase(config?: DatabaseConfig): Promise<unknown> {
  const agentsSQL = config?.schemaSQL || schemaDDL;
  const finalAgentSQL = Array.isArray(agentsSQL) ? agentsSQL : [agentsSQL];

  const url = config?.url || Deno.env.get("DATABASE_URL") || ":memory:";
  const isPgLite = !url || url.startsWith(":") || url.startsWith("file:") || url.startsWith("pglite:");
  const filteredSchemaSQL = isPgLite
    ? finalAgentSQL.filter((stmt: string) => !/^\s*CREATE\s+EXTENSION\b/i.test(stmt))
    : finalAgentSQL;

  const finalConfig = {
    url,
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp", "vector", "pg_trgm"],
    schemaSQL: [...filteredSchemaSQL],
    useWorker: config?.useWorker || false,
    logMetrics: true,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  const debug = (typeof Deno !== 'undefined' && (Deno.env.get("COPILOTZ_DB_DEBUG") === '1'));
  if (debug) {
    console.log(`[db] createDatabase requested: ${cacheKey} ${globalCache.has(cacheKey) ? '[cache-hit]' : '[cache-miss]'}`);
  }
  if (globalCache.has(cacheKey)) {
    return await globalCache.get(cacheKey)!;
  }

  const connectPromise = (async () => {
    if (debug) console.log(`[db] connecting Ominipg: ${cacheKey}`);
    const ominipg = await Ominipg.connect(finalConfig);
    const dbInstance = await withDrizzle(ominipg, drizzle, { ...schema });
    // Attach default operations used by agents/event-queue
    (dbInstance as any).operations = createAgentOperations(dbInstance);
    // Attach knowledge ops for convenience (knowledge module will reuse if present)
    try { (dbInstance as any).kbOps = createKnowledgeOperations(dbInstance); } catch { /* optional */ }
    return dbInstance;
  })();

  globalCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export type DbInstance = Awaited<ReturnType<typeof createDatabase>>;


