// Import Ominipg
import { Ominipg, withDrizzle } from "omnipg";

// Import Drizzle
import { drizzle } from "./drizzle.ts";

// Import Utils
import { splitSQLStatements } from "./migrations/utils.ts";

// Import Schemas
import {
  queue,
  threads,
  messages,
  tasks,
  agents,
  apis,
  tools,
  mcpServers,
  users,
} from "./schemas/index.ts";


// Import Operations
import { createOperations } from "./operations/index.ts";


// Import Migrations File
// import migrations from "./migrations/migration_0001.sql" with { type: "text" };
import migrations from "./migrations/migration_0001.ts";;

// Define the database config interface
export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string[];
  useWorker?: boolean;
  logMetrics?: boolean;
}

// Define the schema
const schema = {
  queue,
  threads,
  messages,
  tasks,
  agents,
  apis,
  tools,
  mcpServers,
  users,
}

const connect = async (finalConfig: DatabaseConfig, debug: boolean, cacheKey: string) => {
  if (debug) console.log(`[db] connecting Ominipg: ${cacheKey}`);
  // Connect to the database
  const ominipg = await Ominipg.connect(finalConfig);
  // Attach schema to the database instance
  const dbInstance = withDrizzle(ominipg, drizzle, { ...schema });
  // Attach default operations used by agents/event-queue
  const operations = createOperations(dbInstance as DbInstance);

  const dbInstanceWithOperations = Object.assign(dbInstance, { operations });

  return dbInstanceWithOperations;
}

export type DbInstance = Awaited<ReturnType<typeof connect>>;
export type CopilotzDb = DbInstance & { operations: ReturnType<typeof createOperations> };

const GLOBAL_CACHE_KEY = "__copilotz_db_cache__";
const existingCache = (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] as Map<string, Promise<DbInstance>> | undefined;
const globalCache: Map<string, Promise<DbInstance>> = existingCache ?? new Map();
(globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] = globalCache;


// Create singleton database instance with 
export async function createDatabase(config?: DatabaseConfig) {

  const isPgLite = !config?.url || config?.url.startsWith(":") || config?.url.startsWith("file:") || config?.url.startsWith("pglite:");

  const url = config?.url || Deno.env.get("DATABASE_URL") || ":memory:";

  const finalConfig: DatabaseConfig = {
    url,
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: isPgLite ? config?.pgliteExtensions || ["uuid_ossp", "pg_trgm"] : [],
    schemaSQL: splitSQLStatements(migrations),
    useWorker: isPgLite ? config?.useWorker || false : false,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  const debug = (typeof Deno !== 'undefined' && (Deno.env.get("COPILOTZ_DB_DEBUG") === '1'));
  if (debug) {
    console.log(`[db] createDatabase requested: ${cacheKey} ${globalCache.has(cacheKey) ? '[cache-hit]' : '[cache-miss]'}`);
  }
  if (globalCache.has(cacheKey)) {
    return await globalCache.get(cacheKey)!;
  }

  const connectPromise: Promise<CopilotzDb> = connect(finalConfig, debug, cacheKey);

  globalCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export { schema };

